import { iblRotationAtom, lightAtomsAtom } from "../../store";
import { useAtomValue } from "jotai";
import { LightRenderer } from "./LightRenderer";

export function Env({ enableEvents = false }: { enableEvents?: boolean }) {
  const lightAtoms = useAtomValue(lightAtomsAtom);
  const iblRotation = useAtomValue(iblRotationAtom);

  return (
    <>
      <color attach="background" args={["black"]} />
      <group rotation={[0, iblRotation, 0]}>
        {lightAtoms.map((lightAtom, i) => (
          <LightRenderer
            key={lightAtom.toString()}
            index={i}
            lightAtom={lightAtom}
            enableEvents={enableEvents}
          />
        ))}
      </group>
    </>
  );
}
