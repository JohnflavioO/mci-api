import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Novo Projeto" },
      { name: "description", content: "Página inicial pronta para um novo projeto." },
      { property: "og:title", content: "Novo Projeto" },
      { property: "og:description", content: "Página inicial pronta para um novo projeto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return <main className="min-h-screen bg-background" />;
}
