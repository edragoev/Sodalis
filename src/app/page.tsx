import LinkFlow from "@/components/LinkFlow";
import RedirectIfLinked from "@/components/RedirectIfLinked";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <RedirectIfLinked />
      <LinkFlow />
    </main>
  );
}
