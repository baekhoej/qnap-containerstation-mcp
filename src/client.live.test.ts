import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ContainerStationClient } from "./client.js";

// Confirmed working endpoints as of Container Station 3.x on QNAP baekhoej1.local:
//   GET  /container
//   GET  /apps
//   PUT  /container/docker/{id}/start
//   PUT  /container/docker/{id}/stop
//   PUT  /container/docker/{id}/restart
//
// The following return 404 on this version and are excluded from live tests:
//   GET /container/{type}/{id}, /inspect, /logs
//   GET /apps/{name} and app actions
//   GET /networks, /system/resource, /log

const { QNAP_URL, QNAP_USERNAME, QNAP_PASSWORD, QNAP_TEST_CONTAINER_ID } = process.env;
const skip = !QNAP_URL || !QNAP_USERNAME || !QNAP_PASSWORD;

if (skip) {
  console.warn("Skipping live tests: QNAP_URL, QNAP_USERNAME, QNAP_PASSWORD not set.");
}

// Safe test container: set QNAP_TEST_CONTAINER_ID to a container ID you're OK stopping/starting.
// Defaults to finding a container named "alpine-1".
const TEST_CONTAINER_ID = QNAP_TEST_CONTAINER_ID ?? null;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const client = skip
  ? null
  : new ContainerStationClient({
      baseUrl: QNAP_URL!,
      username: QNAP_USERNAME!,
      password: QNAP_PASSWORD!,
      verifySSL: false,
    });

describe.skipIf(skip)("live API", () => {
  beforeAll(async () => {
    await client!.login();
  });

  afterAll(async () => {
    await client!.logout();
  });

  it("lists containers", async () => {
    const containers = await client!.listContainers();
    expect(Array.isArray(containers)).toBe(true);
    console.log(`Found ${containers.length} containers:`);
    for (const c of containers) {
      console.log(`  [${c.state.padEnd(8)}] ${c.name} (${c.image})`);
    }
  });

  it("lists apps", async () => {
    const apps = await client!.listApps();
    expect(typeof apps).toBe("object");
    console.log("Apps:", JSON.stringify(apps, null, 2));
  });

  describe("container actions (requires QNAP_TEST_CONTAINER_ID or alpine-1)", () => {
    let testId: string;

    beforeAll(async () => {
      if (TEST_CONTAINER_ID) {
        testId = TEST_CONTAINER_ID;
      } else {
        const containers = await client!.listContainers();
        const alpine = containers.find((c) => c.name === "alpine-1");
        if (!alpine) throw new Error("No test container found. Set QNAP_TEST_CONTAINER_ID or create alpine-1.");
        testId = alpine.id;
      }
      console.log(`Using test container: ${testId}`);
    });

    it("stops the container", { timeout: 15000 }, async () => {
      await client!.stopContainer("docker", testId);
      const containers = await client!.listContainers();
      const c = containers.find((c) => c.id === testId);
      expect(c?.state).toBe("stopped");
    });

    it("starts the container", { timeout: 15000 }, async () => {
      await client!.startContainer("docker", testId);
      const containers = await client!.listContainers();
      const c = containers.find((c) => c.id === testId);
      expect(c?.state).toBe("running");
    });

    it("restarts the container", { timeout: 30000 }, async () => {
      await client!.restartContainer("docker", testId);
      const containers = await client!.listContainers();
      const c = containers.find((c) => c.id === testId);
      expect(c?.state).toBe("running");
    });
  });
});
