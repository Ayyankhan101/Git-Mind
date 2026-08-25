import React from "react";

export default function SceneManager({ children, style, className }) {
  return (
    <div style={style} className={className}>
      {children?.({
        sceneRef: { current: { scene: null } },
        subscribe: () => () => {},
        prefersReduced: false,
      })}
    </div>
  );
}
