import { CursorArrowRippleIcon } from "@heroicons/react/24/outline";
import { PrimitiveAtom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Pane } from "tweakpane";
import { Light, isLightPaintingAtom, updateLightByIdAtom } from "../../store";

type PaneLightModel = {
  name: string;
  scale: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  latlon: { x: number; y: number };
  target: { x: number; y: number; z: number };
  color?: string;
  intensity: number;
  opacity: number;
  additive: boolean;
  type: Light["type"];
  lightSides?: number;
  lightPosition?: { x: number; y: number };
  lightDistance?: number;
  color2?: string;
};

function createPaneModel(light: Light): PaneLightModel {
  return {
    name: light.name,
    scale: light.scale,
    scaleX: light.scaleX,
    scaleY: light.scaleY,
    rotation: light.rotation,
    latlon: structuredClone(light.latlon),
    target: structuredClone(light.target),
    color: "color" in light ? light.color : undefined,
    intensity: light.intensity,
    opacity: light.opacity,
    additive: light.additive,
    type: light.type,
    lightSides: light.type === "procedural_umbrella" ? light.lightSides : undefined,
    lightPosition:
      light.type === "procedural_scrim"
        ? structuredClone(light.lightPosition)
        : undefined,
    lightDistance:
      light.type === "procedural_scrim" ? light.lightDistance : undefined,
    color2: light.type === "sky_gradient" ? light.color2 : undefined,
  };
}

export function LightProperties({
  lightAtom,
}: {
  lightAtom: PrimitiveAtom<Light>;
}) {
  const [isLightPainting, setLightPainting] = useAtom(isLightPaintingAtom);
  const light = useAtomValue(lightAtom);
  const updateLightById = useSetAtom(updateLightByIdAtom);
  const containerRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<Pane | null>(null);
  const paneModelRef = useRef<PaneLightModel>(createPaneModel(light));

  const updateLightValue = useCallback(
    (key: string, value: unknown) => {
      updateLightById({
        lightId: light.id,
        updater: (current) => {
          const nextValue = structuredClone(value);
          return {
            ...current,
            [key]: nextValue,
          } as Light;
        },
      });
    },
    [light.id, updateLightById]
  );

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    paneModelRef.current = createPaneModel(light);
    const pane = new Pane({ container: containerRef.current, expanded: true });
    paneRef.current = pane;

    const handleBindingChange = (event: { target: { key: string }; value: unknown }) => {
      updateLightValue(event.target.key, event.value);
    };

    pane.addBinding(paneModelRef.current, "name").on("change", handleBindingChange);

    pane.addBlade({ view: "separator" });

    pane
      .addBinding(paneModelRef.current, "scale", { min: 0, max: 10, step: 0.1 })
      .on("change", handleBindingChange);
    pane
      .addBinding(paneModelRef.current, "scaleX", {
        label: "width",
        min: 0,
        max: 10,
        step: 0.1,
      })
      .on("change", handleBindingChange);
    pane
      .addBinding(paneModelRef.current, "scaleY", {
        label: "height",
        min: 0,
        max: 10,
        step: 0.1,
      })
      .on("change", handleBindingChange);
    pane
      .addBinding(paneModelRef.current, "rotation", {
        min: -Math.PI,
        max: Math.PI,
        step: 0.01,
      })
      .on("change", handleBindingChange);
    pane
      .addBinding(paneModelRef.current, "latlon", {
        x: { min: -1, max: 1, step: 0.01 },
        y: { inverted: true, min: -1, max: 1, step: 0.01 },
      })
      .on("change", handleBindingChange);
    pane
      .addBinding(paneModelRef.current, "target", {
        x: { min: -10, max: 10, step: 0.1 },
        y: { min: -10, max: 10, step: 0.1 },
        z: { min: -10, max: 10, step: 0.1 },
      })
      .on("change", handleBindingChange);
    pane
      .addButton({ title: "Paint Light", label: "", disabled: isLightPainting })
      .on("click", () => {
        setLightPainting(true);
        toast("Light Paint Mode Activated", {
          duration: Infinity,
          action: {
            label: "Done",
            onClick: () => setLightPainting(false),
          },
          icon: <CursorArrowRippleIcon className="w-4 h-4" />,
          description: "Click on the model to paint the light.",
        });
      });

    pane.addBlade({ view: "separator" });

    if ("color" in paneModelRef.current) {
      pane
        .addBinding(paneModelRef.current, "color")
        .on("change", handleBindingChange);
    }
    pane
      .addBinding(paneModelRef.current, "intensity", {
        min: 0,
        max: 100,
        step: 0.1,
      })
      .on("change", handleBindingChange);
    pane
      .addBinding(paneModelRef.current, "opacity", { min: 0, max: 1 })
      .on("change", handleBindingChange);
    pane
      .addBinding(paneModelRef.current, "additive")
      .on("change", handleBindingChange);

    pane.addBlade({ view: "separator" });

    pane.addBinding(paneModelRef.current, "type", { readonly: true });

    if (light.type === "procedural_umbrella") {
      pane
        .addBinding(paneModelRef.current, "lightSides", { min: 3, max: 20 })
        .on("change", handleBindingChange);
    }

    if (light.type === "procedural_scrim") {
      pane
        .addBinding(paneModelRef.current, "lightPosition", {
          label: "scrim xy",
          x: { min: -1, max: 1 },
          y: { inverted: true, min: -1, max: 1 },
        })
        .on("change", handleBindingChange);
      pane
        .addBinding(paneModelRef.current, "lightDistance", {
          min: 0.01,
          max: 1,
          label: "spread",
        })
        .on("change", handleBindingChange);
    }

    if (light.type === "sky_gradient") {
      pane
        .addBinding(paneModelRef.current, "color2")
        .on("change", handleBindingChange);
    }

    return () => {
      paneRef.current = null;
      pane.dispose();
    };
  }, [isLightPainting, light.id, light.type, setLightPainting, updateLightValue]);

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) {
      return;
    }

    Object.assign(paneModelRef.current, createPaneModel(light));
    pane.refresh();
  }, [light]);

  return <div ref={containerRef} />;
}
