import { useRegisterSW } from "virtual:pwa-register/react";
import { useSyncStatus } from "../store/hooks.js";
import { dismissRejected, flush } from "../store/store.js";

export function ErrorMessage({ error }) {
  if (!error) return null;
  return (
    <p className="error" role="alert">
      {error.message ?? String(error)}
    </p>
  );
}

// One line under the header that says where your changes are.
export function SyncBar() {
  const { online, syncing, pending, rejected } = useSyncStatus();
  const changes = `${pending} change${pending === 1 ? "" : "s"}`;

  return (
    <>
      {rejected && (
        <div className="bar bar-error" role="alert">
          <span>A change couldn't be saved: {rejected.message}</span>
          <button className="link" onClick={dismissRejected}>
            OK
          </button>
        </div>
      )}
      {!online ? (
        <div className="bar bar-offline" role="status">
          <span className="status-dot" aria-hidden="true" />
          Offline. {pending ? `${changes} saved on this device, will sync later.` : "Changes are saved on this device."}
        </div>
      ) : pending > 0 ? (
        <div className="bar bar-pending" role="status">
          <span>{syncing ? `Syncing ${changes}…` : `${changes} waiting to sync.`}</span>
          {!syncing && (
            <button className="link" onClick={flush}>
              Retry now
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}

// The service worker (see vite.config.js) keeps a copy of the app. When a new
// version has been deployed it downloads it in the background and asks before
// switching, so a half-typed form is never lost to a surprise reload.
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="bar bar-update" role="status">
      <span>A new version of TripSync is available.</span>
      <button className="link" onClick={() => updateServiceWorker(true)}>
        Reload
      </button>
    </div>
  );
}
