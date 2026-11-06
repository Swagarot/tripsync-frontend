// Frontend pipeline: lint -> build -> push -> deploy (frontend only).
// Same shape as the backend Jenkinsfile in tripsync-backend; the Helm chart
// lives in tripsync-devops and is checked out next to this repo.
pipeline {
    // Run every stage on the agent VM, never on the controller.
    agent { label 'k3s-agent' }

    options {
        // We check out into subfolders ourselves (see 'Checkout'), so the
        // devops repo doesn't end up inside the Docker build context.
        skipDefaultCheckout()
        // Two frontend builds running helm upgrade at once would collide.
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    // No webhooks (Jenkins is Tailscale-only), so poll GitHub every ~5 min.
    // The trigger is registered only after the job has run once.
    triggers { pollSCM('H/5 * * * *') }

    // "Build with Parameters" shows a dropdown. The first choice is the
    // default, and SCM-polling builds always use the default, so automatic
    // builds keep deploying to the homelab. Pick 'eks' manually for AWS.
    // Note: Jenkins only learns about this block after one build has run it.
    parameters {
        choice(name: 'TARGET', choices: ['k3s', 'eks'],
               description: 'Cluster to deploy to: homelab k3s or AWS EKS')
    }

    environment {
        REGISTRY_USER = 'swagarot'
        IMAGE_NAME    = 'swagarot/tripsync-frontend'
    }

    stages {
        stage('Checkout') {
            steps {
                // 'scm' = the repo/branch/credentials configured in the job.
                dir('frontend') {
                    checkout scm
                }
                // The Helm chart (and values-k3s.yaml, which Deploy commits to).
                // Cloned with plain git on purpose: Jenkins polls every repo
                // checked out by a git/checkout step, and even with poll: false
                // tripsync-devops commits started both jobs (proven 2026-10-31
                // from Docker Hub push times). With GitOps every "Deploy" commit
                // then rebuilt both apps. Polling can't see a shell clone, so
                // only commits to this repo (frontend) start a frontend build.
                withCredentials([gitUsernamePassword(
                        credentialsId: '6daea266-02fa-4ffd-ad67-4ab97eec3938',
                        gitToolName: 'Default')]) {
                    sh '''
                        rm -rf devops
                        git clone -q --branch main                           https://github.com/Swagarot/tripsync-devops.git devops
                    '''
                }
            }
        }

        stage('Lint') {
            parallel {
                // Both pipelines deploy this chart, so both lint it first.
                stage('Helm chart') {
                    steps {
                        // Lint with the defaults, as k3s (what Argo CD renders)
                        // and as EKS (what the eks branch below deploys).
                        sh '''
                            helm lint devops/k8s-helm/tripsync
                            helm lint devops/k8s-helm/tripsync -f devops/k8s-helm/tripsync/values-k3s.yaml
                            helm lint devops/k8s-helm/tripsync -f devops/k8s-helm/tripsync/values-eks.yaml \
                              --set s3.bucket=tripsync-photos-lint
                        '''
                    }
                }
                stage('ESLint') {
                    steps {
                        // Throwaway Node container, run as the jenkins user so
                        // node_modules isn't root-owned in the workspace.
                        // npm ci installs exactly what package-lock.json says.
                        sh '''
                            docker run --rm -u $(id -u):$(id -g) -e HOME=/tmp \
                              -v "$PWD/frontend:/src" -w /src node:24-alpine \
                              sh -c "npm ci && npm run lint"
                        '''
                    }
                }
            }
        }

        stage('Unit tests') {
            steps {
                // Vitest (same API as Jest, but reuses vite.config.js, so no
                // separate Babel setup). The ESLint stage's `npm ci` already
                // filled frontend/node_modules in the workspace, so this only
                // runs the tests. JUnit XML shows results on the build page.
                sh '''
                    docker run --rm -u $(id -u):$(id -g) -e HOME=/tmp                       -v "$PWD/frontend:/src" -w /src node:24-alpine                       npx vitest run --reporter=default --reporter=junit --outputFile.junit=test-results.xml
                '''
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'frontend/test-results.xml'
                }
            }
        }

        stage('Set image tag') {
            steps {
                script {
                    // Short SHA of the frontend repo: unique tag per build.
                    env.IMAGE_TAG = sh(
                        script: 'git -C frontend rev-parse --short HEAD',
                        returnStdout: true
                    ).trim()
                    echo "Image tag: ${env.IMAGE_TAG}"
                }
            }
        }

        stage('Build image') {
            steps {
                // node_modules from the lint stage is skipped via .dockerignore;
                // the Dockerfile runs its own install inside the build.
                sh 'docker build -t $IMAGE_NAME:$IMAGE_TAG frontend'
            }
        }

        stage('Push image') {
            steps {
                // Secret exposed only inside this block and masked in logs.
                // Triple single quotes: the shell expands $DH_TOKEN, not Groovy.
                // 'latest' is pushed too, for the backend job's first install
                // on a fresh cluster (see the backend Jenkinsfile).
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'DH_USER',
                    passwordVariable: 'DH_TOKEN')]) {
                    sh '''
                        echo "$DH_TOKEN" | docker login -u "$DH_USER" --password-stdin
                        docker push $IMAGE_NAME:$IMAGE_TAG
                        docker tag $IMAGE_NAME:$IMAGE_TAG $IMAGE_NAME:latest
                        docker push $IMAGE_NAME:latest
                    '''
                }
            }
        }

        stage('Deploy') {
            steps {
                // Same lock as the backend job: one deploy at a time.
                lock('tripsync-release') {
                    // EKS: --reset-then-reuse-values keeps the backend tag from
                    // the previous release and only changes ours. --install:
                    // install the release if it doesn't exist yet.
                    script {
                        if (params.TARGET == 'eks') {
                            // Two Secret-text credentials, exposed as the env
                            // vars the AWS CLI reads, only inside this block.
                            withCredentials([
                                string(credentialsId: 'aws-access-key-id',
                                       variable: 'AWS_ACCESS_KEY_ID'),
                                string(credentialsId: 'aws-secret-access-key',
                                       variable: 'AWS_SECRET_ACCESS_KEY')]) {
                                // Separate kubeconfig in the workspace, so the
                                // jenkins user's ~/.kube/config (k3s) is never
                                // touched. It holds no secret: kubectl/helm run
                                // 'aws eks get-token' with the keys above.
                                // On EKS the release is stored in 'tripsync'.
                                // values-eks.yaml: Postgres on a gp3 EBS volume,
                                // photos in S3 instead of Garage (terraform/aws).
                                // The bucket is named after the AWS account.
                                sh '''
                                    export AWS_DEFAULT_REGION=eu-central-1
                                    export KUBECONFIG="$WORKSPACE/kubeconfig-eks"
                                    aws eks update-kubeconfig --name tripsync-cluster \
                                      --kubeconfig "$WORKSPACE/kubeconfig-eks"
                                    ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
                                    helm upgrade --install tripsync devops/k8s-helm/tripsync -n tripsync \
                                      --reset-then-reuse-values \
                                      -f devops/k8s-helm/tripsync/values-eks.yaml \
                                      --set-string frontend.image.tag=$IMAGE_TAG \
                                      --set s3.bucket=tripsync-photos-$ACCOUNT \
                                      --atomic --timeout 3m
                                    kubectl get pods -n tripsync
                                '''
                            }
                        } else {
                            // k3s: GitOps. Jenkins doesn't touch the cluster:
                            // it writes the new tag into values-k3s.yaml in
                            // tripsync-devops and pushes, and Argo CD (running
                            // in k3s) rolls it out within about a minute. The
                            // commit is the deploy record; git revert = rollback.
                            // gitUsernamePassword: the git plugin gives the
                            // GitHub token to git through GIT_ASKPASS, so it is
                            // never in a URL or in the log. The token needs
                            // write access to tripsync-devops.
                            withCredentials([gitUsernamePassword(
                                    credentialsId: '6daea266-02fa-4ffd-ad67-4ab97eec3938',
                                    gitToolName: 'Default')]) {
                                // yq (throwaway container) changes one key and
                                // keeps the file's comments. No change = no
                                // commit, so rebuilding the same SHA is a no-op.
                                // If the other job pushed in between, the push
                                // is refused: start again from the new main.
                                sh '''
                                    cd devops
                                    git config user.name "Jenkins"
                                    git config user.email "jenkins@tripsync.invalid"
                                    for attempt in 1 2 3; do
                                      git fetch -q origin main
                                      git reset -q --hard origin/main
                                      docker run --rm -u $(id -u):$(id -g) -e IMAGE_TAG \
                                        -v "$PWD:/w" -w /w mikefarah/yq:4.54.1 -i \
                                        '.frontend.image.tag = strenv(IMAGE_TAG)' \
                                        k8s-helm/tripsync/values-k3s.yaml
                                      if git diff --quiet; then
                                        echo "values-k3s.yaml already has frontend $IMAGE_TAG: nothing to deploy"
                                        exit 0
                                      fi
                                      git commit -q -am "Deploy frontend $IMAGE_TAG"
                                      if git push -q origin HEAD:main; then
                                        echo "Pushed. Argo CD deploys it; watch it on port 30443."
                                        exit 0
                                      fi
                                      echo "Push refused (the other job pushed first?), retrying"
                                      sleep 5
                                    done
                                    exit 1
                                '''
                            }
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            sh 'docker logout || true'
        }
    }
}
