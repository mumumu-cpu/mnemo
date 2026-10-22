import { motion } from "motion/react";
import { useState } from "react";
import { useImageSrc } from "../store";

/** Image that fades/blurs in once decoded, with a shimmer placeholder until then. */
export function Img({ k, alt = "" }: { k: string; alt?: string }) {
  const src = useImageSrc(k);
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && <span className="skel" style={{ position: "absolute", inset: 0, padding: 0 }}><b style={{ height: "100%", borderRadius: 0 }} /></span>}
      {src && (
        <motion.img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setLoaded(true)}
          initial={{ opacity: 0, scale: 1.06, filter: "blur(8px)" }}
          animate={loaded ? { opacity: 1, scale: 1, filter: "blur(0px)" } : undefined}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
    </>
  );
}
