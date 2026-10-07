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
                // The Helm chart. poll: false so a chart-only commit doesn't
                // trigger a frontend build.
                dir('devops') {
                    git branch: 'main',
                        credentialsId: '6daea266-02fa-4ffd-ad67-4ab97eec3938',
                        url: 'https://github.com/Swagarot/tripsync-devops.git',
                        poll: false
                }
            }
        }

        stage('Lint') {
            parallel {
                // Both pipelines deploy this chart, so both lint it first.
                stage('Helm chart') {
                    steps {
                        sh 'helm lint devops/k8s-helm/tripsync'
                    }
                }
                stage('ESLint') {
                    steps {
                        // Throwaway Node container, run as the jenkins user so
                        // node_modules isn't root-owned in the workspace.
                        // npm ci installs exactly what package-lock.json says.
                        sh '''
                            docker run --rm -u $(id -u):$(id -g) -e HOME=/tmp \
                              -v "$PWD/frontend:/src" -w /src node:20-alpine \
                              sh -c "npm ci && npm run lint"
                        '''
                    }
                }
            }
        }

        // Unit tests (Jest) go here in Week 7.

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
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'DH_USER',
                    passwordVariable: 'DH_TOKEN')]) {
                    sh '''
                        echo "$DH_TOKEN" | docker login -u "$DH_USER" --password-stdin
                        docker push $IMAGE_NAME:$IMAGE_TAG
                    '''
                }
            }
        }

        stage('Deploy') {
            steps {
                // Same lock as the backend job: one helm upgrade at a time.
                lock('tripsync-release') {
                    // --reset-then-reuse-values keeps the backend tag from the
                    // previous release and only changes ours. -n default is
                    // where the release is stored; pods run in 'tripsync'.
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
                                sh '''
                                    export AWS_DEFAULT_REGION=eu-central-1
                                    export KUBECONFIG="$WORKSPACE/kubeconfig-eks"
                                    aws eks update-kubeconfig --name tripsync-cluster \
                                      --kubeconfig "$WORKSPACE/kubeconfig-eks"
                                    helm upgrade tripsync devops/k8s-helm/tripsync -n tripsync \
                                      --reset-then-reuse-values \
                                      --set-string frontend.image.tag=$IMAGE_TAG \
                                      --atomic --timeout 3m
                                    kubectl get pods -n tripsync
                                '''
                            }
                        } else {
                            // k3s: unchanged, uses ~/.kube/config on the agent.
                            sh '''
                                helm upgrade tripsync devops/k8s-helm/tripsync -n default \
                                  --reset-then-reuse-values \
                                  --set-string frontend.image.tag=$IMAGE_TAG \
                                  --atomic --timeout 3m
                                kubectl get pods -n tripsync
                            '''
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
