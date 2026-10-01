import { JOINT_IDS, type JointId, type PoseJointSnapshot } from "./pose-joints";
import { cameraFrameFromSnapshot, projectPoseJoints, type PoseCameraSnapshot, type PoseViewPoint } from "./pose-projection";

/** Data-shape version for the pose search snapshot. Not a pose-preset file version. */
export const POSE_SEARCH_SNAPSHOT_VERSION = 1;

/**
 * One consistent sample for a later pose search.
 * projectedPose is computed from this pose and this camera, not from a second read.
 * Joint ids stay on the mannequin's own left and right.
 */
export type PoseSearchSnapshot = {
  version: typeof POSE_SEARCH_SNAPSHOT_VERSION;
  pose: PoseJointSnapshot[];
  camera: PoseCameraSnapshot;
  projectedPose: PoseViewPoint[];
};

/**
 * The text search can include one prop word. This snapshot's joint pose
 * is not sent to the image search API yet.
 * Gender stays unrestricted. Camera distance is not a full-body or bust query.
 * Do not build weapon meshes, judge historical accuracy, or drop era and costume
 * filters when the result list is short.
 */
export const POSE_SEARCH_PROP_KINDS = ["none", "bow", "sword", "spear", "shield"] as const;

export type PoseSearchPropKind = (typeof POSE_SEARCH_PROP_KINDS)[number];

export const POSE_SEARCH_RULES = {
  usesEraAndCostume: true,
  usesPropKind: true,
  usesJointPose: true,
  restrictsGender: false,
  usesCameraZoomAsFraming: false,
  buildsWeaponModels: false,
  judgesHistoricalAccuracy: false,
  relaxesFiltersWhenSparse: false,
} as const;

export function buildPoseSearchSnapshot(
  pose: readonly PoseJointSnapshot[],
  camera: PoseCameraSnapshot,
): PoseSearchSnapshot | null {
  const ordered = orderPose(pose);
  if (!ordered) return null;
  const cameraCopy = copyCamera(camera);
  return {
    version: POSE_SEARCH_SNAPSHOT_VERSION,
    pose: ordered,
    camera: cameraCopy,
    projectedPose: projectPoseJoints(ordered, cameraFrameFromSnapshot(cameraCopy)),
  };
}

function orderPose(pose: readonly PoseJointSnapshot[]): PoseJointSnapshot[] | null {
  const byId = new Map<JointId, PoseJointSnapshot>();
  for (const joint of pose) {
    if (byId.has(joint.id)) return null;
    byId.set(joint.id, joint);
  }
  if (byId.size !== JOINT_IDS.length) return null;
  const ordered: PoseJointSnapshot[] = [];
  for (const id of JOINT_IDS) {
    const joint = byId.get(id);
    if (!joint) return null;
    ordered.push({
      id,
      parent: joint.parent,
      rotation: { ...joint.rotation },
      position: { ...joint.position },
    });
  }
  return ordered;
}

function copyCamera(camera: PoseCameraSnapshot): PoseCameraSnapshot {
  return {
    position: { ...camera.position },
    target: { ...camera.target },
    quaternion: { ...camera.quaternion },
    projectionType: camera.projectionType,
    fieldOfView: camera.fieldOfView,
    orthographicScale: camera.orthographicScale,
    aspectRatio: camera.aspectRatio,
  };
}
