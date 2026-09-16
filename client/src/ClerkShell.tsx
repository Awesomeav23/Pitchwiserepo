/**
 * Everything that imports Clerk, in one module, so it can be code-split.
 *
 * Without this the SDK sits in the main bundle for everyone, including anyone
 * running on the development session who will never use it. Same reasoning as
 * the VexFlow split in ADR-015: a screen should not pay for a dependency it
 * does not reach.
 */
import { ClerkProvider, SignedIn, SignedOut, UserButton } from '@clerk/clerk-react';
import { ClerkBridge } from './api/ClerkBridge';
import { CLERK_PUBLISHABLE_KEY } from './api/session';
import { SignInScreen } from './screens/SignIn';

export default function ClerkShell({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY!} afterSignOutUrl="/">
      <SignedOut><SignInScreen /></SignedOut>
      <SignedIn>
        <ClerkBridge>{children}</ClerkBridge>
      </SignedIn>
    </ClerkProvider>
  );
}

/** The account menu, exported here so App does not import Clerk directly. */
export { UserButton };
