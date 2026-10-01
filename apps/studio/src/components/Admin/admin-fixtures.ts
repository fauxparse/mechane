import type { AdminShow } from "./AdminUserDetail";
import type { AdminUser } from "./admin-user";

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

export const MOCK_ADMIN: AdminUser = {
  id: "admin-1",
  name: "Ada Admin",
  email: "admin@example.com",
  role: "admin",
  banned: false,
  createdAt: daysAgo(120),
};

export const MOCK_DIRECTOR: AdminUser = {
  id: "user-1",
  name: "Lauren Ipsum",
  email: "test@example.com",
  role: "user",
  banned: false,
  createdAt: daysAgo(30),
};

export const MOCK_BANNED: AdminUser = {
  id: "user-2",
  name: "",
  email: "spam@example.com",
  role: "user",
  banned: true,
  createdAt: daysAgo(2),
};

export const MOCK_USERS: readonly AdminUser[] = [MOCK_BANNED, MOCK_DIRECTOR, MOCK_ADMIN];

export const MOCK_SHOWS: readonly AdminShow[] = [
  {
    id: "show_1",
    name: "The Tempest",
    createdAt: daysAgo(20),
    updatedAt: daysAgo(1),
  },
  {
    id: "show_2",
    name: "Quiz Night",
    createdAt: daysAgo(28),
    updatedAt: daysAgo(9),
  },
];
