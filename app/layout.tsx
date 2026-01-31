import type { Metadata } from "next";
import "../src/app/globals.css";

export const metadata: Metadata = {
    title: "SlotHunter - Visa Slot Hunter",
    description: "Automate your visa slot hunting. Never miss a slot again.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
            </head>
            <body className="antialiased" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                {children}
            </body>
        </html>
    );
}
