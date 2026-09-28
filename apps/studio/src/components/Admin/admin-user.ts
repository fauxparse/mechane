// One account as the admin area shows it (issue #826): Better Auth's admin
// user, with dates as ISO strings like every other API date the Studio shows.

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  createdAt: string;
}

/** A link that is a real `href` for new tabs, and a client-side navigation on a plain click. */
export interface AdminDestination {
  href: string;
  onSelect(): void;
}
