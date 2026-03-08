import { createRoot } from "react-dom/client";
import "./index.css";
import { config, hasRequiredFrontendEnv, getMissingFrontendEnvKeys } from "@/config/runtime";
import { RuntimeConfigError } from "@/components/shared/RuntimeConfigError";
import { restoreSpaRedirect } from "@/lib/restoreSpaRedirect";

restoreSpaRedirect(config.basePath);

const root = createRoot(document.getElementById("root")!);

if (hasRequiredFrontendEnv()) {
  void import("./App.tsx")
    .then(({ default: App }) => {
      root.render(<App />);
    })
    .catch(() => {
      root.render(
        <RuntimeConfigError
          missingKeys={["APP_BOOTSTRAP_FAILED"]}
        />,
      );
    });
} else {
  root.render(<RuntimeConfigError missingKeys={getMissingFrontendEnvKeys()} />);
}
