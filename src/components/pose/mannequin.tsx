"use client";

import { useEffect, useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { MeshStandardMaterial } from "three";
import type { JointId } from "@/lib/pose-joints";
import { JointPivot, posePick, usePoseRig } from "@/components/pose/pose-rig";

const BODY = "#c8c8c3";

export function Mannequin() {
  const { select } = usePoseRig();
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: BODY,
        roughness: 0.76,
        metalness: 0,
      }),
    [],
  );

  useEffect(() => () => material.dispose(), [material]);

  return (
    <JointPivot id="pelvis" position={[0, 0.82, 0]}>
      <mesh name="pelvis-bone" material={material} scale={[1.15, 0.92, 1.02]} {...posePick("pelvis", select)}>
        <capsuleGeometry args={[0.12, 0.1, 8, 18]} />
      </mesh>
      <JointPivot id="spine" position={[0, 0.06, 0]}>
        <mesh name="torso" material={material} position={[0, 0.2, 0]} scale={[1.02, 1, 0.86]} {...posePick("spine", select)}>
          <capsuleGeometry args={[0.15, 0.52, 8, 18]} />
        </mesh>
        <JointPivot id="neck" position={[0, 0.5, 0]}>
          <mesh name="neck-bone" material={material} position={[0, 0.04, 0]} {...posePick("neck", select)}>
            <capsuleGeometry args={[0.05, 0.06, 6, 14]} />
          </mesh>
          <group name="head" position={[0, 0.12, 0]}>
            <mesh name="head-bone" material={material} position={[0, 0.1, 0.012]} scale={[0.95, 1.08, 0.98]} {...posePick("neck", select)}>
              <sphereGeometry args={[0.115, 32, 24]} />
            </mesh>
          </group>
        </JointPivot>
        <Arm side="left" material={material} onPick={select} />
        <Arm side="right" material={material} onPick={select} />
      </JointPivot>
      <Leg side="left" material={material} onPick={select} />
      <Leg side="right" material={material} onPick={select} />
    </JointPivot>
  );
}

function Arm({
  side,
  material,
  onPick,
}: {
  side: "left" | "right";
  material: MeshStandardMaterial;
  onPick: (id: JointId) => void;
}) {
  const sign = side === "left" ? -1 : 1;
  const shoulder: JointId = side === "left" ? "leftShoulder" : "rightShoulder";
  const elbow: JointId = side === "left" ? "leftElbow" : "rightElbow";
  const wrist: JointId = side === "left" ? "leftWrist" : "rightWrist";
  return (
    <JointPivot id={shoulder} position={[sign * 0.14, 0.38, 0]}>
      <group rotation={[0, 0, sign * -Math.PI / 2]}>
        <Segment name={`upper-arm-${side}`} material={material} radius={0.05} reach={0.28} {...posePick(shoulder, onPick)} />
        <JointPivot id={elbow} position={[0, 0.28, 0]}>
          <Segment name={`forearm-${side}`} material={material} radius={0.04} reach={0.24} {...posePick(elbow, onPick)} />
          <JointPivot id={wrist} position={[0, 0.24, 0]}>
            <mesh name={`hand-${side}`} material={material} position={[0, 0.07, 0]} {...posePick(wrist, onPick)}>
              <boxGeometry args={[0.1, 0.14, 0.045]} />
            </mesh>
          </JointPivot>
        </JointPivot>
      </group>
    </JointPivot>
  );
}

function Leg({
  side,
  material,
  onPick,
}: {
  side: "left" | "right";
  material: MeshStandardMaterial;
  onPick: (id: JointId) => void;
}) {
  const sign = side === "left" ? -1 : 1;
  const hip: JointId = side === "left" ? "leftHip" : "rightHip";
  const knee: JointId = side === "left" ? "leftKnee" : "rightKnee";
  const ankle: JointId = side === "left" ? "leftAnkle" : "rightAnkle";
  return (
    <JointPivot id={hip} position={[sign * 0.1, 0.02, 0]}>
      <Segment name={`thigh-${side}`} material={material} radius={0.075} reach={0.4} downward {...posePick(hip, onPick)} />
      <JointPivot id={knee} position={[0, -0.4, 0]}>
        <Segment name={`shin-${side}`} material={material} radius={0.052} reach={0.36} downward {...posePick(knee, onPick)} />
        <JointPivot id={ankle} position={[0, -0.36, 0]}>
          <mesh name={`foot-${side}`} material={material} position={[0, -0.04, 0.06]} {...posePick(ankle, onPick)}>
            <boxGeometry args={[0.11, 0.08, 0.26]} />
          </mesh>
        </JointPivot>
      </JointPivot>
    </JointPivot>
  );
}

function Segment({
  name,
  material,
  radius,
  reach,
  downward = false,
  onClick,
}: {
  name: string;
  material: MeshStandardMaterial;
  radius: number;
  reach: number;
  downward?: boolean;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const center = (downward ? -1 : 1) * (reach / 2);
  return (
    <mesh name={name} material={material} position={[0, center, 0]} onClick={onClick}>
      <capsuleGeometry args={[radius, reach, 8, 16]} />
    </mesh>
  );
}
