import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        
        // Load the backend .env file to get real SMTP credentials
        const envPath = path.resolve(process.cwd(), '../backend/.env');
        let smtpConfig = {
            host: "smtp.gmail.com",
            port: 587,
            user: "",
            pass: "",
            to: ""
        };

        if (fs.existsSync(envPath)) {
            const envConfig = dotenv.parse(fs.readFileSync(envPath));
            smtpConfig.user = envConfig.SMTP_USER || "";
            smtpConfig.pass = envConfig.SMTP_PASSWORD || "";
            smtpConfig.to = envConfig.POLICE_EMAILS || "commish@hydpolice.gov.in";
        }

        // If no credentials found, fallback to ethereal
        let transporter;
        if (smtpConfig.user && smtpConfig.pass) {
            transporter = nodemailer.createTransport({
                host: smtpConfig.host,
                port: smtpConfig.port,
                secure: false, // true for 465, false for other ports
                auth: {
                    user: smtpConfig.user,
                    pass: smtpConfig.pass,
                },
            });
        } else {
            console.log("No SMTP credentials found. Falling back to Ethereal.");
            let testAccount = await nodemailer.createTestAccount();
            transporter = nodemailer.createTransport({
                host: "smtp.ethereal.email",
                port: 587,
                secure: false,
                auth: {
                    user: testAccount.user,
                    pass: testAccount.pass,
                },
            });
        }

        // 3. Setup email data
        let htmlContent = `
            <div style="font-family: monospace; background: #0f172a; color: #22d3ee; padding: 20px; border-radius: 10px; max-width: 600px; margin: 0 auto; border: 1px solid #1e293b;">
                <h1 style="color: #f43f5e; margin-bottom: 0;">🚨 AEGIS MEDICAL EMERGENCY</h1>
                <h3 style="color: #64748b; margin-top: 5px;">URGENT DISPATCH - CITY OPERATING SYSTEM</h3>
                <hr style="border-color: #1e293b; margin: 20px 0;"/>
                
                <table style="width: 100%; color: #cbd5e1; font-size: 14px;">
                    <tr><td style="padding: 5px 0;"><strong>LOCATION:</strong></td><td>${body.location}</td></tr>
                    <tr><td style="padding: 5px 0;"><strong>CLASSIFICATION:</strong></td><td><span style="color: #f43f5e; font-weight: bold;">${body.severity}</span></td></tr>
                    <tr><td style="padding: 5px 0;"><strong>AI CONFIDENCE:</strong></td><td>${body.confidence}%</td></tr>
                    <tr><td style="padding: 5px 0;"><strong>STATUS:</strong></td><td>AED DRONE DISPATCHED - GREEN WAVE ACTIVATED</td></tr>
                </table>

                <div style="margin-top: 20px;">
                    <strong style="color: #94a3b8;">EVIDENCE CAPTURED:</strong><br/>
                    <img src="cid:evidence_screenshot" style="width: 100%; border-radius: 8px; margin-top: 10px; border: 2px solid #334155;" alt="Emergency Evidence"/>
                </div>

                <div style="margin-top: 30px; font-size: 10px; color: #475569; text-align: center;">
                    AUTOMATED DISPATCH FROM LAMINAR AI SYSTEM<br/>
                    DO NOT REPLY TO THIS EMAIL
                </div>
            </div>
        `;

        // 4. Send mail with defined transport object
        let info = await transporter.sendMail({
            from: '"Laminar OS" <system@laminar.city>', // sender address
            to: smtpConfig.to || "commish@hydpolice.gov.in", // list of receivers
            subject: `🚨 MEDICAL EMERGENCY: Drone dispatched to ${body.location}`, // Subject line
            html: htmlContent, // html body
            attachments: body.screenshotUrl ? [
                {
                    filename: 'evidence.jpg',
                    path: body.screenshotUrl, // Data URI (Base64)
                    cid: 'evidence_screenshot' // same cid value as in the html img src
                }
            ] : []
        });

        const previewUrl = smtpConfig.user ? null : nodemailer.getTestMessageUrl(info);
        console.log("Email sent: %s", info.messageId);

        return NextResponse.json({ 
            success: true, 
            message: "Email dispatched successfully",
            previewUrl: previewUrl,
            realEmail: !!smtpConfig.user
        });
    } catch (error) {
        console.error("Email error:", error);
        return NextResponse.json({ success: false, error: "Failed to dispatch email", details: String(error) }, { status: 500 });
    }
}
