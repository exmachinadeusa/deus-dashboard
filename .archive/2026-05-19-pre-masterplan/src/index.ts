import { bot, logger } from './bot';

async function main() {
  logger.info('🤖 DEUS Operasyon Sistemi başlatılıyor...');
  logger.info('Token: ' + (process.env.TELEGRAM_BOT_TOKEN?.substring(0, 20) + '...'));
  
  try {
    logger.info('Bot.start() çağrılıyor...');
    await bot.start({
      allowed_updates: [
        'message',
        'callback_query',
        'channel_post',
      ],
      drop_pending_updates: true,
    });
    
    logger.info('✅ Bot aktif ve çalışıyor');
  } catch (error) {
    console.error('ERROR DUMP:', error);
    if (error instanceof Error) {
      logger.error({ msg: '❌ Bot başlatılamadı', err: error.message });
      logger.error({ msg: 'Stack', stack: error.stack });
    } else {
      logger.error({ msg: '❌ Bot başlatılamadı', err: JSON.stringify(error) });
    }
    process.exit(1);
  }
}

main();

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('🛑 Bot kapatılıyor...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('🛑 Bot sonlandırılıyor...');
  process.exit(0);
});
