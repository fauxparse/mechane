import type { Meta, StoryObj } from "@storybook/react-vite";

import { StoryRouter } from "../StoryRouter";
import { MOCK_ADMIN, MOCK_BANNED, MOCK_DIRECTOR, MOCK_SHOWS } from "./admin-fixtures";
import { AdminUserDetail } from "./AdminUserDetail";

const meta: Meta<typeof AdminUserDetail> = {
  title: "studio/Components/Admin/AdminUserDetail",
  component: AdminUserDetail,
  parameters: { layout: "fullscreen" },
  args: {
    user: MOCK_DIRECTOR,
    pending: false,
    isSelf: false,
    onSetRole: () => {},
    settingRole: false,
    onBan: () => {},
    onUnban: () => {},
    banPending: false,
    onRemove: () => {},
    removing: false,
    mayImpersonate: true,
    onImpersonate: () => {},
    impersonating: false,
    shows: MOCK_SHOWS,
    showsPending: false,
    onDeleteShow: () => {},
    deletingShowId: null,
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
type Story = StoryObj<typeof AdminUserDetail>;

export const Default: Story = {};

export const Banned: Story = {
  args: { user: MOCK_BANNED, shows: [] },
};

/** An admin looking at their own account: nothing that could lock them out. */
export const Self: Story = {
  args: { user: MOCK_ADMIN, isSelf: true },
};

/** An admin looking at another admin: their role cannot impersonate admins. */
export const OtherAdmin: Story = {
  args: { user: MOCK_ADMIN, mayImpersonate: false },
};

export const Impersonating: Story = {
  args: { impersonating: true },
};

export const DeletingShow: Story = {
  args: { deletingShowId: MOCK_SHOWS[0]?.id ?? null },
};

export const ActionError: Story = {
  args: { actionError: "You are not allowed to change users role." },
};

export const Loading: Story = {
  args: { user: undefined, pending: true, shows: [], showsPending: true },
};
