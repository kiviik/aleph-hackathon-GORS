import { pollCameraImages } from "./pollCameraImages";
import * as nearbyCameraImages from "./nearbyCameraImages";

jest.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock("./nearbyCameraImages", () => ({
  resolveLocation: jest.fn(),
  getNearbyCameraImages: jest.fn(),
}));

const resolveLocation = nearbyCameraImages.resolveLocation as jest.Mock;
const getNearbyCameraImages = nearbyCameraImages.getNearbyCameraImages as jest.Mock;

const CAMERA = {
  id: "loc75",
  name: "17 Ave & 4 St SW",
  latitude: 51.0374,
  longitude: -114.0798,
  imageUrl: "https://trafficcam.calgary.ca/loc75.jpg",
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resolveLocation.mockResolvedValue({ latitude: 51.0374, longitude: -114.0798 });
  getNearbyCameraImages.mockResolvedValue([{ camera: CAMERA, distanceMeters: 120 }]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("pollCameraImages", () => {
  it("hace un fetch inicial inmediato y luego uno por cada intervalo", async () => {
    const onUpdate = jest.fn();
    const stop = pollCameraImages({ latitude: 51.0374, longitude: -114.0798 }, { onUpdate, intervalMs: 60_000 });

    await jest.advanceTimersByTimeAsync(0);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(60_000);
    expect(onUpdate).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(60_000 * 3);
    expect(onUpdate).toHaveBeenCalledTimes(5);

    stop();
  });

  it("resuelve una dirección una sola vez, sin volver a geocodificar en cada tick", async () => {
    const stop = pollCameraImages({ address: "1200 17 Ave SW" }, { onUpdate: jest.fn(), intervalMs: 1_000 });

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(1_000 * 4);

    expect(resolveLocation).toHaveBeenCalledTimes(1);
    expect(getNearbyCameraImages).toHaveBeenCalledTimes(5);

    stop();
  });

  it("agrega un cache-buster distinto a cada tick para no reusar la imagen anterior", async () => {
    const onUpdate = jest.fn();
    const stop = pollCameraImages({ latitude: 51.0374, longitude: -114.0798 }, { onUpdate, intervalMs: 1_000 });

    await jest.advanceTimersByTimeAsync(0);
    const firstUrl: string = onUpdate.mock.calls[0][0][0].camera.imageUrl;

    await jest.advanceTimersByTimeAsync(1_000);
    const secondUrl: string = onUpdate.mock.calls[1][0][0].camera.imageUrl;

    expect(firstUrl).toMatch(/^https:\/\/trafficcam\.calgary\.ca\/loc75\.jpg\?t=\d+$/);
    expect(firstUrl).not.toEqual(secondUrl);

    stop();
  });

  it("detiene el polling por completo al llamar stop()", async () => {
    const onUpdate = jest.fn();
    const stop = pollCameraImages({ latitude: 51.0374, longitude: -114.0798 }, { onUpdate, intervalMs: 1_000 });

    await jest.advanceTimersByTimeAsync(0);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    stop();
    await jest.advanceTimersByTimeAsync(10_000);

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("reporta errores via onError sin cortar los ticks siguientes", async () => {
    getNearbyCameraImages.mockRejectedValueOnce(new Error("upstream 502"));

    const onUpdate = jest.fn();
    const onError = jest.fn();
    const stop = pollCameraImages(
      { latitude: 51.0374, longitude: -114.0798 },
      { onUpdate, onError, intervalMs: 1_000 }
    );

    await jest.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onUpdate).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1_000);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    stop();
  });
});
