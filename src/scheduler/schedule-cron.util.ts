import { CronExpressionParser } from 'cron-parser';

export function getNextCronExecution(
  cronExpression: string,
  timezone: string,
  from: Date = new Date(),
): Date {
  const expression = CronExpressionParser.parse(cronExpression, {
    tz: timezone,
    currentDate: from,
  });

  return expression.next().toDate();
}
