const express=require('express');
const cors=require('cors');
const app=express();
const request=require('request');
const url='https://intriguebillingsoft-default-rtdb.firebaseio.com/';
const header= {'Content-Type': 'application/x-www-form-urlencoded'};
var timeout=2000;


app.use(express.json());
app.use(cors());
app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
    });

app.get('/biller_name',function(req,res){
    var names;
    request({url:url+'billername.json'},(err,res)=>{
        names=JSON.parse(res.body);
    })
    setTimeout(() => {
        res.send(names);  
    }, timeout);
    
    })

app.post('/save_bill',function(req,res){
    const data=req.body;
    request.post({url:url+'bills.json',form:JSON.stringify(data),headers:header},function(error,httpResponse,body){
        res.send({status:true,message:"Bill Was Added Successfully"})
    })
})

app.get('/print_bill',function(req,res){
        var printdata=[];
        request({url:url+'bills.json'},(err,res)=>{
            const data=JSON.parse(res.body);
            printdata=[...new Map(Object.entries(data)).values()];
        })
        setTimeout(() => {
            res.send({status:true,message:"Bill Fetched Successfully",data:printdata[printdata.length-1]});
        }, timeout);
})


app.get('/bill_list',function(req,res){
    var allbill=[];
    request({url:url+'bills.json'},(err,res)=>{
        const data=JSON.parse(res.body);
        allbill=[...new Map(Object.entries(data)).values()];
    })
    setTimeout(() => {
        res.send({status:true,message:"Bill Fetched Successfully",data:allbill});
    }, timeout);
})

app.post('/get_bill',function(req,res){
    var selectedbill=[];
    var lastdata=[];
    request({url:url+'bills.json'},(err,res)=>{
        const data=JSON.parse(res.body);
        selectedbill=[...new Map(Object.entries(data)).values()];
        lastdata.push(selectedbill.filter((el)=>el.invoice_number==req.body.getterid))
    })
    setTimeout(() => {
        res.send({status:true,message:"Bill Fetched Successfully",data:lastdata[0][0]});
    }, timeout);
})


app.post('/password',function(req,res){
    var passfilter=[];
    request({url:url+'password.json'},(err,res)=>{
        const data=JSON.parse(res.body);
        passfilter=[...new Map(Object.entries(data)).values()];
    })
    setTimeout(() => {
        if(passfilter[passfilter.length-1].password==req.body.password){
            res.send({status:true,message:"password is Correct"});
        }else{
            res.send({status:false,message:"password is Incorrect"});
        }
    }, timeout);
})

app.post('/resetpassword',function(req,res){
    var resetpassfilter=[];
    request({url:url+'password.json'},(err,res)=>{
        const data=JSON.parse(res.body);
        resetpassfilter=[...new Map(Object.entries(data)).values()];
    })
    setTimeout(() => {
        if(resetpassfilter[resetpassfilter.length-1].password==req.body.oldpassword){
            const obj={password:req.body.newpassword};
            request.post({url:url+'password.json',form:JSON.stringify(obj),headers:header},function(error,httpResponse,body){
                res.send({status:true,message:"password Changed Successfully"});
            })
        }else{
            res.send({status:false,message:"Old Password is Incorrect"});
        }
    }, timeout);
})

app.listen(3000,()=>{
    console.log("Server is Listening");
})
