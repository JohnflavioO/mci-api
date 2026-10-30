import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Recover gracefully when a browser tab still references JavaScript chunks from
// an older deployment. The session guard prevents an infinite reload loop.
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    const recoveryKey = "mci-xpress:chunk-recovery";
    if (window.sessionStorage.getItem(recoveryKey) !== "1") {
      window.sessionStorage.setItem(recoveryKey, "1");
      window.location.reload();
    }
  });
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
