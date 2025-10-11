"use client";

import InteractiveAvatar from "@/components/InteractiveAvatar";
export default function App() {
  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="w-full max-w-4xl mx-auto flex flex-col items-start justify-start gap-4 md:gap-5 px-4 md:px-6 pt-2 md:pt-4 pb-4 md:pb-20 h-full">
        <div className="w-full flex-1 min-h-0">
          <InteractiveAvatar />
        </div>
      </div>
    </div>
  );
}
