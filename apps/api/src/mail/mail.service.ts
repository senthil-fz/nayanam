import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { maskEmail } from '../common/email-mask';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.from = this.config.get<string>('SMTP_FROM') ?? 'no-reply@nayanam.local';
    this.transporter = createTransport({
      host: this.config.get<string>('SMTP_HOST') ?? 'localhost',
      port: Number(this.config.get<string>('SMTP_PORT') ?? 1025),
      secure: false,
      // MailHog accepts unauthenticated mail; real providers override via env.
      auth: this.config.get<string>('SMTP_USER')
        ? {
            user: this.config.get<string>('SMTP_USER')!,
            pass: this.config.get<string>('SMTP_PASS')!,
          }
        : undefined,
    });
  }

  async sendOtp(email: string, code: string): Promise<void> {
    const subject = `Your Nayanam code: ${code}`;
    const text = `Your one-time code is ${code}. It expires in 10 minutes.\n\nIf you did not request this, ignore this email.`;
    await this.transporter.sendMail({ from: this.from, to: email, subject, text });
    this.logger.log(`OTP mailed to ${maskEmail(email)}`);
  }

  async sendInvite(email: string, householdName: string, acceptUrl: string): Promise<void> {
    const subject = `You've been invited to join ${householdName} on Nayanam`;
    const text = `You have been invited to join the household "${householdName}".\n\nAccept here: ${acceptUrl}\n\nThis invite expires in 7 days.`;
    await this.transporter.sendMail({ from: this.from, to: email, subject, text });
    this.logger.log(`Invite mailed to ${maskEmail(email)}`);
  }

  /** Send an email-change OTP to the NEW address. */
  async sendEmailChangeOtp(newEmail: string, code: string): Promise<void> {
    const subject = `Confirm your new Nayanam email: ${code}`;
    const text = `Your email-change confirmation code is ${code}. It expires in 10 minutes.\n\nIf you did not request this change, you can ignore this email.`;
    await this.transporter.sendMail({ from: this.from, to: newEmail, subject, text });
    this.logger.log(`Email-change OTP mailed to ${maskEmail(newEmail)}`);
  }

  /** Tripwire notice to the OLD address after an email change completes. */
  async sendEmailChangedNotice(oldEmail: string, newEmailMasked: string): Promise<void> {
    const subject = 'Your Nayanam email was changed';
    const text = `Your Nayanam account email was just changed to ${newEmailMasked}.\n\nIf this was you, no action is needed. If not, contact support immediately.`;
    await this.transporter.sendMail({ from: this.from, to: oldEmail, subject, text });
    this.logger.log(`Email-change notice mailed to ${maskEmail(oldEmail)}`);
  }

  /** Generic send for notification-dispatch email fan-out + weekly summary. */
  async sendGeneric(email: string, subject: string, text: string, html?: string): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to: email, subject, text, html });
    this.logger.log(`Generic mail sent to ${maskEmail(email)}`);
  }
}
