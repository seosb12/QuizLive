import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// 폰트는 npm 패키지로 앱 안에 포함됩니다 (인터넷 연결 없이도 동일하게 보임)
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";

import "./styles.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
