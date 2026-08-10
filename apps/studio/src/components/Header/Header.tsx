import { Logo } from "./Logo";
import {
  Alert,
  AlertTitle,
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
  InsideSidebar,
  SidebarTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@mechane/design-system";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  HouseIcon,
  LogOutIcon,
  PencilIcon,
  PlayIcon,
  SettingsIcon,
  SidebarIcon,
  SquareIcon,
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
      <div className="flex items-center gap-1 pointer-events-auto bg-muted w-fit rounded-full pl-1">
        <Logo className="size-6" />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" className="rounded-full">
                {title} <ChevronDownIcon className="text-muted-foreground" />
              </Button>
            }
          />
          <DropdownMenuContent>
            <DropdownMenuItem>
              <PencilIcon />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={
                <Link to="/">
                  <HouseIcon />
                  <span>Home</span>
                </Link>
              }
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Tabs defaultValue="graph">
        <TabsList className="bg-muted/50 rounded-[100vw] pointer-events-auto">
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
      <div className="flex items-center gap-2 justify-end pointer-events-auto">
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
            <DropdownMenuItem
              render={
                <Link to="/settings">
                  <SettingsIcon />
                  Settings
                </Link>
              }
            />
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
            <Alert className="rounded-sm border-0 ring-1 ring-destructive bg-destructive/25 text-destructive-foreground mb-1 p-2">
              <AlertTriangleIcon />
              <AlertTitle>This show has unpublished changes.</AlertTitle>
            </Alert>
            <DropdownMenuItem>
              <CheckIcon /> Publish changes
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <SquareIcon /> End run
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <InsideSidebar>
          <SidebarTrigger
            render={
              <Button variant="ghost" size="icon">
                <SidebarIcon />
              </Button>
            }
          />
        </InsideSidebar>
      </div>
    </header>
  );
};
