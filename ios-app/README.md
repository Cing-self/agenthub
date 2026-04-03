# iOS App Scaffold

This folder contains the native iOS app scaffold for the mobile companion.

Current direction:

- Native SwiftUI app, not a wrapped web view
- Connects to the existing local remote bridge API
- Mobile-first chat surface with a left history drawer
- Ready to expand into voice, remote control, and device-native permissions later

## What is included

- `project.yml` for generating an Xcode project with XcodeGen
- SwiftUI app shell and feature structure
- Bridge API client for:
  - `GET /health`
  - `GET /threads`
  - `GET /threads/:id`
  - `POST /turn`
- Local configuration storage for bridge URL and token

## To open later

This project now has a real `.xcodeproj` checked in and has been compiled locally with:

```bash
xcodebuild -project LobsterMobile.xcodeproj -scheme LobsterMobile -configuration Debug -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

## To open and run

1. Open `LobsterMobile.xcodeproj` in Xcode
2. Select the `LobsterMobile` scheme
3. Choose an iPhone simulator or a real device
4. Press Run

## First connection

On first launch, the app opens a connection sheet. You can use:

- `Base URL`: `https://control.nanobanani.app/api`
- `Token`: from AgentHub desktop `Remote Hosts`

For development, the app currently allows HTTP bridge URLs too, so you can point it at a local machine bridge directly if needed.

## Rename later

`LobsterMobile` is only a working app name. It can be renamed after the product name is finalized.
