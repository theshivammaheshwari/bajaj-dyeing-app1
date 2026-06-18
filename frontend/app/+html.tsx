// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        {/*
          Disable body scrolling on web to make ScrollView components work correctly.
          If you want to enable scrolling, remove `ScrollViewStyleReset` and
          set `overflow: auto` on the body style below.
        */}
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              body > div:first-child { min-height: 100vh; display: flex; flex-direction: column; }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }

              /* Custom Scrollbar Styling */
              html { scroll-behavior: smooth; }
              ::-webkit-scrollbar { width: 10px; height: 10px; }
              ::-webkit-scrollbar-track { background: transparent; }
              ::-webkit-scrollbar-thumb { 
                background-color: #90cdf4; 
                border-radius: 10px; 
                border: 2px solid #EDF4FC;
                background-clip: padding-box;
              }
              ::-webkit-scrollbar-thumb:hover { background-color: #2B6CB0; }

              @media print {
                .no-print { display: none !important; }
                .only-print { display: block !important; }
                body { overflow: visible !important; height: auto !important; }
                #root, body > div:first-child { position: static !important; }
                .print-card { border-width: 1px !important; border-color: #000 !important; }
              }
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#EDF4FC",
        }}
      >
        {children}
      </body>
    </html>
  );
}
