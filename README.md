
# MOMO WebRTC Foxglove Extension

  

![screenshot](https://github.com/bot-rover/foxglove-webrtc-momo-extension/blob/master/images/screenshot.png?raw=true)

  

Extension allows to stream camera video feed from the robot to Foxglove Studio via WebRTC. Panel could be used for multiple cameras and shows basic connection information: `framerate`, `current bandwidth`, `round trip time` and `resolution`

It uses [MOMO](https://github.com/shiguredo/momo) WebRTC client for streaming adjusting framerate, resolution and quality based on current network conditions and available bandwidth. Also panel has auto reconnection functionality for unstable cellular networks

## General

MOMO is a WebRTC native client that uses `libwebrtc` and works in various environments without a browser. It supports VP8, VP9 and H.264 hardware encoder functions installed in [NVIDIA Jetson](https://www.nvidia.com/ja-jp/autonomous-machines/embedded-systems/)

It streams directly from video device and not from ROS `sensor_msgs/Image` topic. If you want to stream from ROS topic check **Streaming ROS image** section

## Required changes in source code

This panel uses robots IP address for connecting to MOMO websocket, but connection information is not populated in Foxglove `PanelExtensionAdapter`. So there is two ways of making WebRTC connection: 

- Update MOMO source code to use ROS topics to initiate connection. Hard way because MOMO is written in C++
- Update Foxglove `PanelExtensionAdapter` to provide us IP of the connection

We are using second way and it requires several changes in Foxglove Studio source code. Changes are described [here](https://github.com/foxglove/studio/pull/5672)

## Connection

[Download](https://github.com/shiguredo/momo/releases) MOMO binary or [build](https://github.com/shiguredo/momo/blob/develop/doc/BUILD_LINUX_LOCAL.md) it by yourself ;)

To start MOMO on the robot run: 

  ``` sh
  ./momo --no-audio-device --priority=FRAMERATE --framerate=60  --resolution 1920x1080 --hw-mjpeg-decoder=true --video-device /dev/video0 test --port 8080
  ```
  
Open Foxglove Studio and add  `WebRTC Camera`  panel from the list
 
## Configuration

- Port - websocket port for WebRTC connection initialization
- Retry (ms) - period after which connection will be reinitialized in case of broken connection
- Bandwidth (mbps) - max allowed bandwidth to use by WebRTC (0 - no limit)
- Codec - preferred codec used by MOMO

## Streaming ROS image

If you want to stream ROS `sensor_msgs/Image` via MOMO you can use [image_to_v4l2loopback](https://github.com/lucasw/image_to_v4l2loopback) package. It takes `sensor_msgs/Image` and puts to _virtual video device_ which can be used by MOMO

## Changing framerate and resolution

Keep in mind that MOMO requests specified framerate and resolution from the camera, but uses best matching which camera could provide. For example if you want to stream at 1280x720 30fps, but you camera minimum is 1920x1080 60fps it will use 1920x1080 60fps.

If you want to use framerate and resolution which differs from camera you can do it by using  `v4l2loopback` and `ffmpeg`

Check supported framerates and resolutions by the camera:
``` sh
v4l2-ctl --list-formats-ext -d /dev/video0
```

Install module for _virtual video devices_:

``` sh
sudo apt install v4l2loopback-dkms
```

Create virtual device from real camera:

``` sh
sudo modprobe v4l2loopback devices=1
```

Start FFmpeg rescaling and lowering fps:
``` sh
ffmpeg -f v4l2 -i /dev/video0 -vf scale=320:180 -r 10 -f v4l2 /dev/video1
```

Run MOMO:
``` sh
./momo --no-audio-device --priority=FRAMERATE --framerate=10 --resolution 320x180 --hw-mjpeg-decoder=false --video-device /dev/video1 test --port 8080
```

`--hw-mjpeg-decoder=true` option doesn't work on Jetson Xavier with FFmpeg. Don't know exactly why

## Develop

Make sure you have [Node.js](https://nodejs.org/) 14 or newer installed and the [yarn](https://yarnpkg.com/) package manager (`npm install -g yarn`). To install all packages for this extension run:

```sh
yarn install
```

To build and install the extension into your local Foxglove Studio desktop app, run:

```sh
yarn local-install
```

Open the `Foxglove Studio` desktop (or `ctrl-R` to refresh if it is already open). Your extension is installed and available within the app.

## Package

Extensions are packaged into `.foxe` files. These files contain the metadata (package.json) and the build code for the extension.

Before packaging, make sure to set `name`, `publisher`, `version`, and `description` fields in _package.json_. When ready to distribute the extension, run:

```sh
yarn package
```

This command will package the extension into a `.foxe` file in the local directory.

## Publish

You can publish the extension for the public marketplace or privately for your organization.

See documentation here: https://foxglove.dev/docs/studio/extensions/publish#packaging-your-extension