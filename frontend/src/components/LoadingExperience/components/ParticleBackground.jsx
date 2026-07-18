import React, { useEffect, useRef } from "react";
import gsap from "gsap";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia("(prefers-reduced-motion: reduce)")?.matches ?? false)
  );
}

export default function ParticleBackground({ analysisComplete }) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const tlRef = useRef(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.offsetWidth;
        canvas.height = parent.offsetHeight;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const COUNT = 25;
    const particles = Array.from({ length: COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: 1.5 + Math.random() * 3,
      dx: (Math.random() - 0.5) * 0.3,
      dy: -0.2 - Math.random() * 0.3,
      opacity: 0.15 + Math.random() * 0.35,
    }));
    particlesRef.current = particles;

    let animId;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.dx;
        p.y += p.dy;
        if (p.y < -10) p.y = canvas.height + 10;
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34, 211, 238, ${p.opacity})`;
        ctx.fill();
      }
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (!analysisComplete) return;
    if (tlRef.current) tlRef.current.kill();
    tlRef.current = gsap.to(particlesRef.current, {
      opacity: 0.6,
      duration: 2,
      ease: "power1.out",
      stagger: 0.05,
    });
    return () => {
      if (tlRef.current) tlRef.current.kill();
    };
  }, [analysisComplete]);

  return (
    <>
      <canvas ref={canvasRef} className="lg-particles" aria-hidden="true" />
      <div className="lg-scanlines" aria-hidden="true" />
      <div className="lg-gradient-overlay" aria-hidden="true" />
    </>
  );
}
