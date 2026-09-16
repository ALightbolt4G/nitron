// main.m — Entry point for the Nitron iOS shell.
//
// No Storyboard, no UIScene lifecycle — deliberately kept as simple as
// possible so it compiles cleanly with a bare clang + cctools-port
// toolchain (no Xcode project file involved at all). UIApplicationMain
// picks up AppDelegate by name below.

#import <UIKit/UIKit.h>
#import "AppDelegate.h"

int main(int argc, char *argv[]) {
    @autoreleasepool {
        return UIApplicationMain(argc, argv, nil, NSStringFromClass([AppDelegate class]));
    }
}
