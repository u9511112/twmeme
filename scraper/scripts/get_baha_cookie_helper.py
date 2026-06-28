import asyncio
import sys
from pathlib import Path
import logging

try:
    from patchright.async_api import async_playwright
except ImportError:
    from playwright.async_api import async_playwright

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("baha_cookie_helper")

def update_env(bahasid: str):
    env_path = Path(__file__).parent.parent / ".env"
    logger.info(f"Writing BAHASID to {env_path.absolute()}")
    if not env_path.exists():
        env_path.write_text(f"BAHASID={bahasid}\n", encoding="utf-8")
        return
        
    lines = env_path.read_text(encoding="utf-8").splitlines()
    updated = False
    for i, line in enumerate(lines):
        if line.strip().startswith("BAHASID="):
            lines[i] = f"BAHASID={bahasid}"
            updated = True
            break
    if not updated:
        lines.append(f"BAHASID={bahasid}")
        
    env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

async def main():
    print("\n" + "="*60)
    print(" 正在為您啟動巴哈姆特登入瀏覽器...")
    print(" 請在彈出的瀏覽器視窗中完成登入與行動電話認證。")
    print(" 登入完成後，本腳本會自動擷取 BAHASID 並寫入 .env，隨後自動關閉瀏覽器。")
    print("="*60 + "\n")

    async with async_playwright() as p:
        # Launch headed browser so user can interact
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        
        # Go to Bahamut login page
        await page.goto("https://user.gamer.com.tw/login.php")
        
        bahasid_found = None
        while True:
            # Check cookies
            cookies = await context.cookies()
            bahasid_cookie = next((c for c in cookies if c["name"] == "BAHASID"), None)
            
            if bahasid_cookie:
                val = bahasid_cookie["value"]
                # Verify if we can access the restricted forum with this cookie
                # We can do this by checking if the page is currently on the forum page and we bypass the gate
                current_url = page.url
                if "forum.gamer.com.tw/B.php" in current_url:
                    # Check if there is ".b-list__row" (which means bypass age gate)
                    rows_count = await page.locator(".b-list__row").count()
                    if rows_count > 0:
                        bahasid_found = val
                        break
            
            # If the user successfully logged in but is not yet on the forum page,
            # we can redirect them to the forum page to trigger the age gate verification and cookie save.
            # Usually after login, the user will be redirected. We check if bahasid is present, if so, redirect to forum to verify
            if bahasid_cookie and "login.php" not in page.url and "forum.gamer.com.tw/B.php" not in page.url:
                logger.info("Login detected. Redirecting to Forum BSN=60076 to verify Age Gate bypass...")
                await page.goto("https://forum.gamer.com.tw/B.php?bsn=60076")
                
            await asyncio.sleep(1.5)
            
            # Check if browser is closed by user
            if page.is_closed():
                logger.warning("Browser was closed before login could be completed.")
                sys.exit(1)
                
        print("\n" + "="*60)
        print(f" 成功偵測到有效 BAHASID: {bahasid_found[:8]}...")
        print(" 正在將 BAHASID 寫入 .env...")
        update_env(bahasid_found)
        print(" 寫入成功！正在關閉瀏覽器並開始測試爬取...")
        print("="*60 + "\n")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
