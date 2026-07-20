import { useEffect, useRef, useState } from "react";

const SCENES = [
  { id: "code-repo", accent: "#00D4AA" },
  { id: "analysis", accent: "#7C3AED" },
  { id: "ai-agents", accent: "#00D4AA" },
  { id: "architecture", accent: "#7C3AED" },
  { id: "security", accent: "#00D4AA" },
  { id: "dependencies", accent: "#7C3AED" },
  { id: "report", accent: "#00D4AA" },
];

export default function ScrollWorldBg({ scenes = SCENES, scrollY }) {
  const imgsRef = useRef([]);
  const ticking = useRef(false);
  const mounted = useRef(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const check = () => setMobile(window.innerWidth <= 860);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  /* Update scroll crossfade when scrollY prop changes (Lenis-driven) */
  useEffect(() => {
    mounted.current = true;
    const imgs = imgsRef.current;
    if (!imgs.length) return;

    imgs.forEach((img, i) => {
      img.style.opacity = i === 0 ? "1" : "0";
      img.style.zIndex = i === 0 ? "2" : "1";
    });
  }, [scenes]);

  useEffect(() => {
    if (!mounted.current) return;
    const imgs = imgsRef.current;
    if (!imgs.length) return;

    const y = scrollY ?? 0;
    const docH = Math.max(
      document.documentElement.scrollHeight,
      window.innerHeight,
    );
    const vh = window.innerHeight;
    const maxScroll = docH - vh;
    const progress = maxScroll > 0 ? Math.min(1, y / maxScroll) : 0;
    const N = scenes.length;
    const idx = Math.min(N - 1, Math.floor(progress * N));
    const local = progress * N - idx;

    imgs.forEach((img, i) => {
      if (i === idx) {
        const zoom = 1 + local * 0.05;
        img.style.opacity = "1";
        img.style.transform = `scale(${zoom.toFixed(3)}) translateZ(0)`;
        img.style.zIndex = "2";
      } else if (i === idx + 1) {
        img.style.opacity = String(Math.min(1, local));
        img.style.transform = `scale(${(1 + local * 0.05).toFixed(3)}) translateZ(0)`;
        img.style.zIndex = "2";
      } else if (i === idx - 1) {
        img.style.opacity = String(Math.max(0, 1 - local));
        img.style.zIndex = "1";
      } else {
        img.style.opacity = "0";
        img.style.zIndex = "0";
      }
    });

    document.documentElement.style.setProperty(
      "--sw-accent",
      scenes[idx]?.accent || "#00D4AA",
    );
  }, [scenes, scrollY]);

  const imgUrl = (id) => {
    const m = mobile ? "-m" : "";
    return `/assets/scroll-world/${id}${m}.jpg`;
  };

  return (
    <div className="sw-bg-root" aria-hidden="true">
      <div className="sw-bg-stage">
        {scenes.map((s, i) => (
          <img
            key={s.id}
            ref={(el) => {
              imgsRef.current[i] = el;
            }}
            className="sw-still"
            src={imgUrl(s.id)}
            onError={(e) => {
              if (mobile) {
                e.target.src = `/assets/scroll-world/${s.id}.jpg`;
              }
            }}
            alt=""
            loading={i < 2 ? "eager" : "lazy"}
            decoding="async"
          />
        ))}
      </div>
      <div className="sw-bg-overlay" />
    </div>
  );
}
