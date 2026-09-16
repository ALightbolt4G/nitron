// AppDelegate.m — Deliberately skips the UIScene lifecycle (iOS 13+'s
// "modern" app entry path) in favor of the classic AppDelegate-owns-the-
// window model. Both are fully supported by iOS today as long as
// Info.plist does NOT declare UIApplicationSceneManifest — omitting it
// makes iOS fall back to this simpler model automatically. This keeps
// the shell's moving parts to a minimum, which matters a lot when the
// whole point is that nobody debugs this file per-app.

#import "AppDelegate.h"
#import "ViewController.h"

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    self.window = [[UIWindow alloc] initWithFrame:[[UIScreen mainScreen] bounds]];
    self.window.rootViewController = [[ViewController alloc] init];
    [self.window makeKeyAndVisible];
    return YES;
}

@end
