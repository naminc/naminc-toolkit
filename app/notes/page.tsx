import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Technical Notes", description: "Concise explanations of timestamps, JWTs, web formats, and practical developer concepts by Naminc.", alternates: { canonical: "/notes" } };

const notes = [
  { href: "/notes/how-to-read-unix-timestamps", title: "How to read a Unix timestamp", description: "Seconds, milliseconds, time zones, and the quickest ways to recognize each format.", meta: "5 min read", topic: "Time" },
  { href: "/notes/jwt-decoding-vs-verification", title: "JWT decoding vs. verification", description: "Why readable claims are not proof, and what a secure application must verify.", meta: "6 min read", topic: "Security" },
];

export default function NotesPage() { return <div className="container page-shell notes-page"><div className="page-heading"><h1>Technical notes</h1><p>Short references for details that are easy to forget and important to get right.</p></div><div className="note-list">{notes.map((note) => <Link href={note.href} className="note-card" key={note.href}><span className="note-topic">{note.topic}</span><div><h2>{note.title}</h2><p>{note.description}</p></div><span className="note-meta">{note.meta}</span><span className="note-arrow" aria-hidden="true">→</span></Link>)}</div></div>; }
