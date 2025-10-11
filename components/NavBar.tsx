"use client";

import Link from "next/link";

import { GithubIcon, HeyGenLogo } from "./Icons";

export default function NavBar() {
  return (
    <>
      <div className="flex flex-row justify-between items-center w-full max-w-6xl mx-auto p-4 md:p-6">
        <div className="flex flex-row items-center gap-2 md:gap-4">
          <Link href="https://app.heygen.com/" target="_blank">
            <HeyGenLogo />
          </Link>
          <div className="bg-gradient-to-br from-sky-300 to-indigo-500 bg-clip-text">
            <p className="text-sm md:text-xl font-semibold text-transparent hidden sm:block">
              HeyGen Interactive Avatar SDK NextJS Demo
            </p>
            <p className="text-sm font-semibold text-transparent sm:hidden">
              HeyGen Avatar Demo
            </p>
          </div>
        </div>
        <div className="flex flex-row items-center gap-2 md:gap-6">
          <Link
            href="https://labs.heygen.com/interactive-avatar"
            target="_blank"
            className="text-xs md:text-sm"
          >
            <span className="hidden sm:inline">Avatars</span>
            <span className="sm:hidden">Avatar</span>
          </Link>
          <Link
            href="https://docs.heygen.com/reference/list-voices-v2"
            target="_blank"
            className="text-xs md:text-sm hidden md:inline"
          >
            Voices
          </Link>
          <Link
            href="https://docs.heygen.com/reference/new-session-copy"
            target="_blank"
            className="text-xs md:text-sm hidden lg:inline"
          >
            API Docs
          </Link>
          <Link
            href="https://help.heygen.com/en/articles/9182113-interactive-avatar-101-your-ultimate-guide"
            target="_blank"
            className="text-xs md:text-sm hidden lg:inline"
          >
            Guide
          </Link>
          <Link
            aria-label="Github"
            className="flex flex-row justify-center gap-1 text-foreground text-xs md:text-sm"
            href="https://github.com/HeyGen-Official/StreamingAvatarSDK"
            target="_blank"
          >
            <GithubIcon className="text-default-500" />
            <span className="hidden sm:inline">SDK</span>
          </Link>
        </div>
      </div>
    </>
  );
}
