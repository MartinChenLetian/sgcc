// supabase/functions/send-error-report/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Resend } from "npm:resend@2.0.0"

const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. 处理跨域请求 (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. 获取前端传来的数据
    const { task, errorMsg } = await req.json()

    // 3. 发送邮件
    const { data, error } = await resend.emails.send({
      from: 'SGCC_System <onboarding@resend.dev>', // Resend 默认测试发件人，生产环境需配置域名
      to: ['martin091023@outlook.com'], // 你的管理员邮箱
      subject: `🚨 [SGCC] 数据同步失败报警 (ID: ${task.targetId})`,
      html: `
        <h1>数据上传失败报警</h1>
        <p><strong>时间:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>错误原因:</strong> ${errorMsg}</p>
        <hr />
        <h3>尝试保存的数据:</h3>
        <pre style="background: #f4f4f4; padding: 10px; border-radius: 5px;">
${JSON.stringify(task.payload, null, 2)}
        </pre>
        <p>请管理员手动将上述 JSON 数据更新至数据库。</p>
      `,
    })

    if (error) {
      console.error('Resend Error:', error)
      return new Response(JSON.stringify({ error }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})