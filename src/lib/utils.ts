import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getAvatarUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http') || url.startsWith('data:')) return url;

  const baseUrl = import.meta.env.PROD
    ? ''
    : (import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://127.0.0.1:5000');

  return `${baseUrl}${url}`;
}
