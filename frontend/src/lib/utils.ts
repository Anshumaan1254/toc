import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names (the `cn` helper the shadcn-style components expect). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
