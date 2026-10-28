import { CoreAdminContext, testDataProvider } from "ra-core";
import { render } from "vitest-browser-react";

import { Home } from "./Home";
import { firstNameOf, plural } from "./homeModel";

const totals: Record<string, number> = { deals: 7, contacts: 42, companies: 9 };

const dataProvider = testDataProvider({
  getList: async (resource: string, params: any) => {
    const archivedOnly =
      resource === "deals" && params.filter?.["updated_at@gte"];
    return { data: [], total: archivedOnly ? 2 : totals[resource] } as any;
  },
});

const authProvider = {
  login: async () => {},
  logout: async () => {},
  checkAuth: async () => {},
  checkError: async () => {},
  getPermissions: async () => {},
  getIdentity: async () => ({ id: 1, fullName: "Bay Purcell" }),
};

function mount() {
  return render(
    <CoreAdminContext dataProvider={dataProvider} authProvider={authProvider}>
      <Home />
    </CoreAdminContext>,
  );
}

describe("Home", () => {
  it("asks the question with the person's name and offers three places", async () => {
    const screen = await mount();
    await expect
      .element(screen.getByTestId("home-hello"))
      .toHaveTextContent("Hi, Bay");
    expect(screen.container.querySelector("h1")?.textContent).toBe(
      "What do you need to get done?",
    );
    expect(screen.container.querySelector(".si-lede")?.textContent).toBe(
      "Pick a place to start.",
    );
    const links = screen.container.querySelectorAll("a.hm-tile");
    expect(
      [...links].map((l) => l.querySelector(".hm-title")?.textContent),
    ).toEqual(["Manage leads", "Add a new lead", "Contacts"]);
    // CoreAdminContext mounts a hash router, so hrefs carry a leading "#".
    expect(
      [...links].map((l) => l.getAttribute("href")?.replace(/^#/, "")),
    ).toEqual(["/deals", "/flow/lead/company", "/contacts"]);
    // Every tile carries an illustration and an arrow, and nothing is raster.
    expect(screen.container.querySelectorAll(".hm-art svg").length).toBe(3);
    expect(screen.container.querySelectorAll("img").length).toBe(0);
  });

  it("writes the live counts into the mono meta lines once they arrive", async () => {
    const screen = await mount();
    const metas = screen.getByTestId("home-meta");
    await expect
      .element(metas.nth(0))
      .toHaveTextContent("7 open leads · 2 moved this week");
    await expect
      .element(metas.nth(1))
      .toHaveTextContent("3 steps · about a minute");
    await expect
      .element(metas.nth(2))
      .toHaveTextContent("42 contacts · 9 companies");
  });
});

describe("homeModel", () => {
  it("takes the first name and pluralises plainly", () => {
    expect(firstNameOf("Bay Purcell")).toBe("Bay");
    expect(firstNameOf("  Dani ")).toBe("Dani");
    expect(firstNameOf(undefined)).toBe("");
    expect(plural(1, "open lead")).toBe("1 open lead");
    expect(plural(3, "company", "companies")).toBe("3 companies");
  });
});
