import { MechaneIcon } from "@mechane/design-system";
import "./splash.css";

export const SplashScreen = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="splash-screen fixed inset-0 flex flex-col items-center justify-center">
      <MechaneIcon className="w-12 h-12 text-white absolute bottom-4 right-4 opacity-75 drop-shadow-sm" />
      {children}
    </div>
  );
};
