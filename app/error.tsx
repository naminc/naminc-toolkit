"use client";

import { RefreshCw } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <div className="container page-shell empty-page"><p className="eyebrow">Something went wrong</p><h1>This page could not finish loading.</h1><p>Your tool input has not been sent anywhere. Try loading this view again.</p><button type="button" className="button button-primary" onClick={reset}><RefreshCw size={16} />Try again</button></div>; }
