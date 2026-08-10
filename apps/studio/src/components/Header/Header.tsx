import { Logo } from "./Logo";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@mechane/design-system";
import {
  ChevronDownIcon,
  LogOutIcon,
  PlayIcon,
  SettingsIcon,
  SidebarIcon,
  TvMinimalIcon,
  WorkflowIcon,
} from "lucide-react";

type HeaderProps = {
  className?: string;
  title: string;
};

export const Header = ({ className, title }: HeaderProps) => {
  return (
    <header
      className={cn("w-full grid grid-cols-[1fr_auto_1fr] items-center justify-between", className)}
    >
      <div className="flex items-center gap-1">
        <Logo className="size-6" />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost">
                {title} <ChevronDownIcon className="text-muted-foreground" />
              </Button>
            }
          />
          <DropdownMenuContent>
            <DropdownMenuItem>First action</DropdownMenuItem>
            <DropdownMenuItem>Second action</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Tabs defaultValue="graph">
        <TabsList className="bg-muted/50 rounded-[100vw]">
          <TabsTrigger value="graph" className="rounded-[100vw] px-3 border-0">
            <WorkflowIcon />
            Show
          </TabsTrigger>
          <TabsTrigger value="canvas" className="rounded-[100vw] px-3 border-0">
            <TvMinimalIcon />
            Scenes
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex items-center gap-2 justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" className="p-0 h-auto rounded-full">
                <Avatar>
                  <AvatarImage src="https://github.com/shadcn.png" alt="Shadcn" />
                  <AvatarFallback>MP</AvatarFallback>
                </Avatar>
              </Button>
            }
          />
          <DropdownMenuContent>
            <DropdownMenuItem>
              <SettingsIcon />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive">
                <LogOutIcon />
                Log out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button>
                <PlayIcon />
                Live
                <ChevronDownIcon className="text-accent-200" />
              </Button>
            }
          />
          <DropdownMenuContent>
            <DropdownMenuItem>First action</DropdownMenuItem>
            <DropdownMenuItem>Second action</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon">
          <SidebarIcon />
        </Button>
      </div>
    </header>
  );
};
