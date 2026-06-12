import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';

export const sendSingleEmail = async (req, res) => {
    try {
        const { from_email, from_password, to_email, subject, content } = req.body;
        const attachment = req.file;

        // Create transporter with user's Gmail credentials
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: from_email,
                pass: from_password,
            },
        });

        const mailOptions = {
            from: from_email,
            to: to_email,
            subject: subject,
            html: content.replace(/\n/g, '<br>'),
            text: content,
        };

        if (attachment) {
            mailOptions.attachments = [{
                filename: attachment.originalname,
                content: attachment.buffer,
            }];
        }

        await transporter.sendMail(mailOptions);
        
        logger.info(`Email sent to ${to_email} from ${from_email}`);
        
        res.json({
            success: true,
            message: `Email sent to ${to_email}`
        });
    } catch (error) {
        logger.error('Send email error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};