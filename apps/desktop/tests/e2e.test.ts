import { expect, test, _electron as electron } from "@playwright/test";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

function git(args: string[], cwd: string): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  expect(result.status).toBe(0);
  return result.stdout.trim();
}

test("desktop and CLI share the core Skill lifecycle", async () => {
  const root = mkdtempSync(join(tmpdir(), "skill-port-desktop-e2e-"));
  const project = join(root, "project");
  const source = join(root, "source");
  const selectedHub = join(root, "selected-hub");
  mkdirSync(project);
  mkdirSync(source);
  mkdirSync(selectedHub);
  writeFileSync(join(source, "SKILL.md"), "---\nname: desktop-e2e\ndescription: Desktop E2E Skill\n---\n");
  const desktopRoot = resolve(process.cwd());
  const repositoryRoot = resolve(desktopRoot, "../..");
  const executablePath = createRequire(join(desktopRoot, "package.json"))("electron") as string;
  const cliEnv: NodeJS.ProcessEnv = { ...process.env, HOME: root, USERPROFILE: root, SKLP_TEST_HOME: root };
  delete cliEnv.SKLP_HOME;
  const runInfo = () => spawnSync(
    process.execPath,
    [join(repositoryRoot, "dist", "cli.js"), "info", "desktop-e2e"],
    { cwd: project, env: cliEnv, encoding: "utf8" }
  );
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;

  try {
    app = await electron.launch({
      executablePath,
      args: [desktopRoot],
      env: { ...cliEnv, LANG: "en_US.UTF-8" }
    });
    await expect.poll(
      () => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
      { timeout: 30_000 }
    ).toBe(1);
    const page = await app.firstWindow({ timeout: 30_000 });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText(/Set up Skill Port|初始化 Skill Port/, { timeout: 30_000 });
    const switchToEnglish = page.getByRole("button", { name: "English" });
    if (await switchToEnglish.isVisible()) await switchToEnglish.click();
    await expect(page.getByRole("heading", { name: "Set up Skill Port" })).toBeVisible({ timeout: 30_000 });

    await app.evaluate(({ dialog }, selected) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
    }, project);
    await page.getByLabel("Project directory").locator("..").getByRole("button", { name: "Choose" }).click();
    const customHub = page.getByLabel("Custom Hub (optional)");
    await customHub.fill("temporary value");
    await customHub.clear();
    await customHub.fill(selectedHub);
    await page.getByRole("button", { name: "Initialize" }).click();
    await expect(page.getByRole("heading", { name: "Skills" })).toBeVisible();
    await expect(page.getByTitle(selectedHub)).toBeVisible();

    await page.getByRole("button", { name: /Add Skill/ }).click();
    await app.evaluate(({ dialog }, selected) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
    }, source);
    await page.getByRole("dialog").getByRole("button", { name: "Choose" }).click();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.getByText("desktop-e2e — Desktop E2E Skill")).toBeVisible();
    await page.getByRole("button", { name: "Install previewed Skills" }).click();
    await page.getByRole("button", { name: /desktop-e2e/ }).click();
    await expect(page.getByRole("heading", { name: "desktop-e2e" })).toBeVisible();
    await expect(page.getByText("No tags yet.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Check update", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Edit tags" }).click();
    const tagsDialog = page.getByRole("dialog");
    await tagsDialog.getByLabel("Tags").fill("video, Productivity, VIDEO");
    await tagsDialog.getByRole("button", { name: "Save tags" }).click();
    await expect(page.locator(".tag", { hasText: "video" })).toBeVisible();
    await expect(page.locator(".tag", { hasText: "Productivity" })).toBeVisible();
    const taggedInfo = runInfo();
    expect(taggedInfo.status).toBe(0);
    expect(JSON.parse(taggedInfo.stdout).skill.tags).toEqual(["Productivity", "video"]);
    for (const size of [{ width: 1024, height: 720 }, { width: 1440, height: 900 }]) {
      await app.evaluate(({ BrowserWindow }, nextSize) => {
        BrowserWindow.getAllWindows()[0]?.setSize(nextSize.width, nextSize.height);
      }, size);
      const layout = await page.evaluate(() => {
        const filters = document.querySelector<HTMLElement>(".filters")!;
        const filterRect = filters.getBoundingClientRect();
        const controls = [...filters.querySelectorAll<HTMLElement>("input, select")];
        const headingStatus = document.querySelector<HTMLElement>(".detail-heading > .status")!;
        const description = document.querySelector<HTMLElement>(".detail-heading p")!;
        return {
          controlsContained: controls.every((control) => {
            const rect = control.getBoundingClientRect();
            return rect.left >= filterRect.left && rect.right <= filterRect.right;
          }),
          statusHeight: headingStatus.getBoundingClientRect().height,
          descriptionClamp: getComputedStyle(description).webkitLineClamp,
          noHorizontalOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth
        };
      });
      expect(layout.controlsContained).toBe(true);
      expect(layout.statusHeight).toBeLessThan(30);
      expect(layout.descriptionClamp).toBe("4");
      expect(layout.noHorizontalOverflow).toBe(true);
    }

    await page.getByRole("button", { name: /Enable/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Enable" }).click();
    await expect(page.locator(".detail-panel").getByText("healthy", { exact: true }).first()).toBeVisible();
    const enabledInfo = runInfo();
    expect(enabledInfo.status).toBe(0);
    expect(JSON.parse(enabledInfo.stdout).enablements).toHaveLength(1);

    const managedEntry = join(root, ".agents", "skills", "desktop-e2e");
    const unmanagedMarker = join(managedEntry, "user-file.txt");
    rmSync(managedEntry, { recursive: true, force: true });
    mkdirSync(managedEntry);
    writeFileSync(unmanagedMarker, "unmanaged");
    await page.getByRole("navigation").getByRole("button", { name: /Health/ }).click();
    await expect(page.locator(".diagnostic").first()).toBeVisible();
    expect(existsSync(unmanagedMarker)).toBe(true);

    await page.getByRole("navigation").getByRole("button", { name: /Skills/ }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    const blockedRemove = page.getByRole("dialog");
    await expect(blockedRemove.getByTitle(source)).toBeVisible();
    await expect(blockedRemove.getByText(managedEntry, { exact: false })).toBeVisible();
    await blockedRemove.getByRole("checkbox").check();
    await blockedRemove.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(existsSync(unmanagedMarker)).toBe(true);
    await blockedRemove.getByRole("button", { name: "Cancel" }).click();

    rmSync(managedEntry, { recursive: true, force: true });
    await page.getByRole("button", { name: "Disable", exact: true }).click();
    await expect(page.locator(".detail-panel").getByText("Not enabled", { exact: true })).toBeVisible();
    const disabledInfo = runInfo();
    expect(disabledInfo.status).toBe(0);
    expect(JSON.parse(disabledInfo.stdout).enablements).toHaveLength(0);

    await page.getByRole("button", { name: "Remove", exact: true }).click();
    const removeDialog = page.getByRole("dialog");
    await expect(removeDialog.getByTitle(source)).toBeVisible();
    await removeDialog.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByText("No Skills installed yet.")).toBeVisible();
    expect(runInfo().status).not.toBe(0);

    await page.getByRole("button", { name: "中文" }).click();
    await expect(page.getByRole("heading", { name: "技能" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "技能" })).toBeVisible();
    for (const size of [{ width: 1024, height: 720 }, { width: 1440, height: 900 }]) {
      await app.evaluate(({ BrowserWindow }, nextSize) => {
        BrowserWindow.getAllWindows()[0]?.setSize(nextSize.width, nextSize.height);
      }, size);
      await expect.poll(
        () => page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth)
      ).toBe(true);
    }
  } finally {
    await app?.close().catch(() => undefined);
    rmSync(root, { recursive: true, force: true });
  }
});

test("desktop checks, previews, and updates a copied Git Skill", async () => {
  const root = mkdtempSync(join(tmpdir(), "skill-port-desktop-update-e2e-"));
  const project = join(root, "project");
  const hub = join(root, "hub");
  const gitSource = join(root, "git-source");
  mkdirSync(project);
  mkdirSync(gitSource);
  writeFileSync(join(gitSource, "SKILL.md"), "---\nname: desktop-update\ndescription: Before update\n---\n");
  git(["init"], gitSource);
  git(["branch", "-M", "main"], gitSource);
  git(["add", "."], gitSource);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], gitSource);
  const desktopRoot = resolve(process.cwd());
  const repositoryRoot = resolve(desktopRoot, "../..");
  const executablePath = createRequire(join(desktopRoot, "package.json"))("electron") as string;
  const cliEnv: NodeJS.ProcessEnv = { ...process.env, HOME: root, USERPROFILE: root, SKLP_HOME: hub, SKLP_TEST_HOME: root };
  const runCli = (args: string[]) => spawnSync(
    process.execPath,
    [join(repositoryRoot, "dist", "cli.js"), ...args],
    { cwd: project, env: cliEnv, encoding: "utf8" }
  );
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;

  try {
    expect(runCli(["init"]).status).toBe(0);
    expect(runCli(["install", pathToFileURL(gitSource).href]).status).toBe(0);
    app = await electron.launch({
      executablePath,
      args: [desktopRoot],
      env: { ...cliEnv, LANG: "en_US.UTF-8" }
    });
    const page = await app.firstWindow({ timeout: 30_000 });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: /Skills|技能/ })).toBeVisible({ timeout: 30_000 });
    const switchToEnglish = page.getByRole("button", { name: "English" });
    if (await switchToEnglish.isVisible()) await switchToEnglish.click();
    await expect(page.getByRole("heading", { name: "Skills" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /desktop-update/ }).click();
    await page.getByRole("button", { name: "Enable", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Enable", exact: true }).click();

    writeFileSync(join(gitSource, "SKILL.md"), "---\nname: desktop-update\ndescription: After update\n---\n");
    git(["add", "."], gitSource);
    git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "update"], gitSource);
    const updatedRevision = git(["rev-parse", "HEAD"], gitSource);
    await page.getByRole("button", { name: "Check update", exact: true }).click();
    const updateDialog = page.getByRole("dialog");
    await expect(updateDialog.getByText(/desktop-update: outdated/)).toBeVisible();
    await updateDialog.getByRole("button", { name: "Preview update" }).click();
    await expect(updateDialog.getByText(updatedRevision)).toBeVisible();
    await updateDialog.getByRole("button", { name: "Update previewed Skills" }).click();
    await expect(updateDialog.getByText("Update complete")).toBeVisible();
    const updateInfo = runCli(["info", "desktop-update"]);
    expect(updateInfo.status).toBe(0);
    expect(JSON.parse(updateInfo.stdout).skill.sourceRevision).toBe(updatedRevision);
    expect(JSON.parse(updateInfo.stdout).enablements).toHaveLength(1);
  } finally {
    await app?.close().catch(() => undefined);
    rmSync(root, { recursive: true, force: true });
  }
});
