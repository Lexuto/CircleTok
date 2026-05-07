import os

BOT_TOKEN = os.getenv("CIRCLETOK_BOT_TOKEN", "8787130283:AAEc802mSX7pS3gVdSRGpnbpHZeb9w3V6yo")
MODERATOR_BOT_TOKEN = os.getenv("CIRCLETOK_MODERATOR_TOKEN", "8766519172:AAHWvXAByGVWCCEG6HK5JxUa-uzvQ9GVaPk")
ADMIN_ID = int(os.getenv("CIRCLETOK_ADMIN_ID", "2044125331"))  # Твой Telegram ID
WEBAPP_URL = os.getenv("CIRCLETOK_WEBAPP_URL", "https://your-domain.com")

MODERATORS = []  # Можно добавить других модераторов по telegram_id