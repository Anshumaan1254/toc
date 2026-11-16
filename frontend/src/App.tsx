import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, RouterProvider, useRouteError } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/lib/theme";
import { AppShell } from "@/components/layout/AppShell";
import { SmoothScroll } from "@/components/layout/SmoothScroll";
import { ErrorState, LoadingBlock } from "@/components/ui/primitives";

const LandingPage = lazy(() => import("@/pages/landing/LandingPage"));
const ExplorePage = lazy(() => import("@/pages/explore/ExplorePage"));
const DetailPage = lazy(() => import("@/pages/detail/DetailPage"));
const ComparePage = lazy(() => import("@/pages/compare/ComparePage"));
const LearnPage = lazy(() => import("@/pages/learn/LearnPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingBlock className="mx-auto max-w-6xl px-6 pt-32" label="Loading page…" />}>{children}</Suspense>;
}

function RouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : "This page failed to load.";
  return (
    <div className="mx-auto max-w-3xl px-6 pt-32">
      <ErrorState message={message} onRetry={() => window.location.reload()} />
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { path: "/", element: <Page><LandingPage /></Page> },
      { path: "/explore", element: <Page><ExplorePage /></Page> },
      { path: "/explore/:lang/:approach", element: <Page><DetailPage /></Page> },
      { path: "/compare", element: <Page><ComparePage /></Page> },
      { path: "/learn", element: <Page><LearnPage /></Page> },
      { path: "*", element: <Page><NotFound /></Page> },
    ],
  },
]);

export function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SmoothScroll>
          <RouterProvider router={router} />
        </SmoothScroll>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
