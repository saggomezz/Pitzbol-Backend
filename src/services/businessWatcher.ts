import { db } from '../config/firebase';
import { updateBusinessNameInNotifications } from './notification.service';

type Status = 'Activos' | 'Pendientes';

const cache = new Map<string, string>();

function watchStatus(status: Status) {
  const ref = db.collection('negocios').doc(status).collection('items');
  let initialized = false;

  ref.onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      const id = change.doc.id;
      const data = change.doc.data() || {};
      const name = (data?.business?.name || data?.name || '')?.toString() || '';
      const key = `${status}/${id}`;

      if (!initialized) {
        // populate cache on initial load
        cache.set(key, name);
        return;
      }

      if (change.type === 'modified') {
        const prev = cache.get(key) || '';
        if (prev !== name && name) {
          const ownerUid = data?.ownerUid || data?.owner || data?.business?.owner;
          updateBusinessNameInNotifications(id, name, ownerUid || undefined, prev ? [prev] : undefined)
            .catch(err => console.error('[businessWatcher] updateBusinessNameInNotifications error', err));
        }
        cache.set(key, name);
      } else if (change.type === 'added') {
        cache.set(key, name);
      } else if (change.type === 'removed') {
        cache.delete(key);
      }
    });
    initialized = true;
  }, err => {
    console.error('[businessWatcher] Firestore snapshot error for', status, err);
  });
}

export function startBusinessWatcher() {
  try {
    watchStatus('Activos');
    watchStatus('Pendientes');
  } catch (err) {
    console.error('[businessWatcher] Failed to start watchers', err);
  }
}
