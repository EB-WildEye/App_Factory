import { scaffoldStrings } from '@/lib/uiStrings';

/** Server Component. Placeholder until the Admin Dashboard lands. */
export default function HomePage() {
  return (
    <main className="p-8">
      <h1 className="font-serif text-3xl">{scaffoldStrings.heading}</h1>
      <p className="mt-2 text-sm">{scaffoldStrings.status}</p>
    </main>
  );
}
