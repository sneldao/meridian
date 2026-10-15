type ClassValue = string | false | null | undefined | number;

export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
