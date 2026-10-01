import type { Meta, StoryObj } from "@storybook/react-vite";

import { StoryRouter } from "../StoryRouter";
import { MOCK_ADMIN, MOCK_USERS } from "./admin-fixtures";
import { AdminUsers } from "./AdminUsers";

const meta: Meta<typeof AdminUsers> = {
  title: "studio/Components/Admin/AdminUsers",
  component: AdminUsers,
  parameters: { layout: "fullscreen" },
  args: {
    users: MOCK_USERS,
    total: MOCK_USERS.length,
    pending: false,
    search: "",
    onSearchChange: () => {},
    page: 0,
    pageSize: 50,
    onPageChange: () => {},
    currentUserId: MOCK_ADMIN.id,
  },
  decorators: [
    (Story) => (
      <StoryRouter>
        <div className="min-h-screen bg-sunken p-6 text-foreground">
          <Story />
        </div>
      </StoryRouter>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof AdminUsers>;

export const Default: Story = {};

export const Loading: Story = {
  args: { users: [], total: 0, pending: true },
};

export const NoMatches: Story = {
  args: { users: [], total: 0, search: "nobody" },
};

/** The second page of a longer list: both page buttons are live. */
export const SecondPage: Story = {
  args: { page: 1, pageSize: 3, total: 8 },
};

export const LoadError: Story = {
  args: { users: [], total: 0, loadError: "You are not allowed to list users." },
};
