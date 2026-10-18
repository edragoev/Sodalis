export function normalizeGoogleCalendarEmbedUrl(raw: string) {
  const value = raw.trim();
  if (!value) return "";

  const iframeMatch = value.match(/src\s*=\s*["']([^"']+)["']/i);
  const candidate = iframeMatch?.[1] ?? value;

  if (!/^https?:\/\//i.test(candidate)) {
    return `https://${candidate}`;
  }

  return candidate;
}

export function PublicCalendarEmbed({ url, title = "Public Google Calendar" }: { url?: string; title?: string }) {
  const embedUrl = url ? normalizeGoogleCalendarEmbedUrl(url) : "";

  if (!embedUrl) return null;

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-sand bg-white">
      <iframe
        src={embedUrl}
        title={title}
        className="h-[320px] w-full border-0"
        loading="lazy"
      />
    </div>
  );
}
