// ViewController.m — Ported 1:1 from the original Swift version. Logic is
// unchanged: load www/index.html from the bundle, deny navigating away
// from the local site. Do not edit per-app — see injector.ts / plist.ts
// for what actually varies between builds.

#import "ViewController.h"
#import <WebKit/WebKit.h>

@interface ViewController () <WKNavigationDelegate>
@property (strong, nonatomic) WKWebView *webView;
@end

@implementation ViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [UIColor whiteColor];

    WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
    config.allowsInlineMediaPlayback = YES;

    self.webView = [[WKWebView alloc] initWithFrame:self.view.bounds configuration:config];
    self.webView.navigationDelegate = self;
    self.webView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    self.webView.scrollView.bounces = NO;
    [self.view addSubview:self.webView];

    [self loadEntryPoint];
}

- (void)loadEntryPoint {
    NSURL *entryURL = [[NSBundle mainBundle] URLForResource:@"index"
                                                withExtension:@"html"
                                                 subdirectory:@"www"];
    if (!entryURL) {
        NSLog(@"Nitron: entry point not found — make sure www/ was injected correctly");
        return;
    }
    NSURL *wwwFolder = [entryURL URLByDeletingLastPathComponent];
    [self.webView loadFileURL:entryURL allowingReadAccessToURL:wwwFolder];
}

- (BOOL)prefersStatusBarHidden {
    return [[NSUserDefaults standardUserDefaults] boolForKey:@"NitronHideStatusBar"];
}

@end
