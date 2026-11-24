import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  orderBy,
  query,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { getFirebaseRuntime } from './firebase';
import type {
  ArchMaterialSpec,
  HybridTelemetry,
  SavedSpecRecord,
} from '../types/spec';

export async function saveSpecToFirestore(
  uid: string,
  spec: ArchMaterialSpec,
  telemetry: HybridTelemetry
): Promise<string> {
  const { db } = getFirebaseRuntime();
  if (!db) throw new Error('Firestore is not initialized.');

  const now = Timestamp.now();
  const serialized = JSON.stringify(spec).slice(0, 19500);

  const ref = await addDoc(collection(db, 'users', uid, 'specs'), {
    projectTitle: spec.projectTitle.slice(0, 140),
    architecturalStyle: spec.architecturalStyle.slice(0, 80),
    roomType: spec.roomType.slice(0, 80),
    inferenceSource: telemetry.inferenceSource,
    inferenceMode: telemetry.inferenceMode,
    latencyMs: Math.min(300000, Math.max(0, Math.round(telemetry.latencyMs))),
    specJson: serialized,
    createdAt: now,
    updatedAt: now,
  });

  return ref.id;
}

export async function loadSavedSpecs(uid: string): Promise<SavedSpecRecord[]> {
  const { db } = getFirebaseRuntime();
  if (!db) return [];

  const q = query(
    collection(db, 'users', uid, 'specs'),
    orderBy('createdAt', 'desc'),
    limit(12)
  );
  const snap = await getDocs(q);
  const out: SavedSpecRecord[] = [];

  snap.forEach((docSnap) => {
    const d = docSnap.data();
    try {
      const parsed = JSON.parse(String(d.specJson || '{}')) as ArchMaterialSpec;
      if (parsed && parsed.palette && Array.isArray(parsed.materials)) {
        out.push({
          id: docSnap.id,
          projectTitle: String(d.projectTitle || parsed.projectTitle),
          architecturalStyle: String(d.architecturalStyle || parsed.architecturalStyle),
          roomType: String(d.roomType || parsed.roomType),
          inferenceSource: d.inferenceSource || 'IN_CLOUD',
          inferenceMode: d.inferenceMode || 'PREFER_ON_DEVICE',
          latencyMs: Number(d.latencyMs || 0),
          spec: parsed,
          createdAt:
            d.createdAt && typeof d.createdAt.toDate === 'function'
              ? d.createdAt.toDate().toLocaleString()
              : undefined,
        });
      }
    } catch {
      // Skip malformed doc
    }
  });

  return out;
}

export async function deleteSavedSpec(uid: string, specId: string): Promise<void> {
  const { db } = getFirebaseRuntime();
  if (!db) return;
  await deleteDoc(doc(db, 'users', uid, 'specs', specId));
}
